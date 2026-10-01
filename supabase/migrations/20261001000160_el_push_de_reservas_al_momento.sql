-- Fase A de Restavor agents · el push al momento (decisión 99).
--
-- "Los correos, en dos tandas al día salvo que sean importantes; los push, siempre
-- al instante." La cola de siempre (`claim_notification_deliveries`) saca correo y
-- push juntos cuando la recoge el cron de las 07:00 y las 19:00 UTC. Para los dos
-- avisos nuevos de Reservas el push no espera: quien acaba de pedir Reservas lo
-- manda en el acto, reclamando SOLO las entregas de push de esos avisos por su
-- clave de deduplicación. El correo se queda en su tanda.
--
-- Misma forma de resultado y mismo reclamo que `claim_notification_deliveries`
-- (gasta un intento de cada fila que toma, `for update skip locked`); reservada a
-- `service_role`, como el resto de la cola. No cambia el comportamiento de los
-- avisos de Restavor web: sus push siguen en la cola.

create or replace function public.claim_push_deliveries_for_keys(p_dedupe_keys text[])
 RETURNS TABLE(delivery_id uuid, notification_id uuid, attempts integer, channel text, recipient_email text, push_tokens text[], event_type text, audience text, deep_link text, space_name text, entity_type text, establishment_name text, amount_cents bigint, threshold_percent integer, subject text, digest_id uuid, digest_date date, digest_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with tomados as (
    select d.id from public.notification_deliveries d
    join public.notifications nt on nt.id = d.notification_id
    where d.status = 'pending' and d.channel = 'push' and d.next_attempt_at <= now()
      and nt.dedupe_key = any (p_dedupe_keys)
    order by d.next_attempt_at
    limit 50
    for update of d skip locked
  ),
  marcados as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1
    from tomados t
    where d.id = t.id
    returning d.id, d.notification_id, d.digest_id, d.attempts, d.channel
  )
  select m.id, m.notification_id, m.attempts, m.channel,
         coalesce(p.email, pd_perfil.email),
         case when m.channel = 'push' then
           coalesce((
             select array_agg(dev.expo_push_token order by dev.last_seen_at desc)
             from public.push_devices dev
             where dev.user_id = coalesce(n.recipient_id, dg.profile_id)
               and dev.revoked_at is null
           ), '{}'::text[])
         else null end,
         n.event_type, n.audience, n.deep_link,
         coalesce(s.name, s_digest.name),
         n.entity_type,
         ctx.establishment_name,
         n.amount_cents,
         n.threshold_percent,
         ctx.subject,
         dg.id, dg.digest_date, dg.notification_count
  from marcados m
  left join public.notifications n on n.id = m.notification_id
  left join public.notification_digests dg on dg.id = m.digest_id
  left join public.profiles p on p.id = n.recipient_id
  left join public.profiles pd_perfil on pd_perfil.id = dg.profile_id
  left join public.spaces s on s.id = n.space_id
  left join public.spaces s_digest on s_digest.id = dg.space_id
  left join lateral public.notification_push_context(n.id) ctx on true;
end;
$function$;

revoke all on function public.claim_push_deliveries_for_keys(text[]) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries_for_keys(text[]) to service_role;
