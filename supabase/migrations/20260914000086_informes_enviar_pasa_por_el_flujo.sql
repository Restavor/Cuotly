-- Fase 3 · Hito 16 · dos arreglos de la 85, encontrados en la revisión del
-- 14/09/2026 (RN-REP-08, RN-REP-09, RN-REP-12, RN-REP-13).
--
-- La 85 ya está aplicada al proyecto, así que esto es un archivo nuevo:
-- CLAUDE.md prohíbe modificar una migración existente.
--
-- ============================================================
-- 1 · `send_report()` no pasaba por la tabla de transiciones
-- ============================================================
--
-- **El agujero.** `send_report()` comprobaba dos cosas —que quien llama
-- puede aprobar, y que el informe no estaba ya enviado— y después escribía
-- `status = 'sent'` directamente. **Nunca llamaba a
-- `report_transition_allowed()`**, que es la tabla donde viven los seis
-- estados de §95 y que dice que a `sent` solo se llega desde `approved` o
-- desde `scheduled`.
--
-- Consecuencia, reproducida en local antes de escribir esto: un
-- propietario que llame `send_report` por RPC sobre un **borrador recién
-- creado** lo envía. El informe sale al restaurante con el resumen
-- ejecutivo en blanco —la sección que §95.3 dice que la escribe una
-- persona—, se escriben las entregas y los avisos, y el libro de estados
-- se queda con un `preparing → sent` que las dos tablas del proyecto
-- declaran imposible. La pantalla solo ofrece "Enviar ahora" en los
-- estados correctos, y eso es exactamente lo que CLAUDE.md dice que NO es
-- un control de acceso: "ocultar un botón no es un control de acceso".
--
-- El arreglo es una comprobación, no una regla nueva: la tabla ya decía
-- que no se podía; nadie se lo preguntaba. Y con eso basta para cerrar
-- también RN-REP-09, porque `preparing → sent` queda prohibido y los otros
-- dos caminos (`approved` y `scheduled`) ya pasaron por la aprobación.
create or replace function public.send_report(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_version_id uuid;
  v_pending integer;
  v_slug text;
  v_link text;
  v_recipient record;
  v_sent integer := 0;
begin
  select * into v_report from public.reports where id = p_report_id for update;

  if v_report.id is null then
    raise exception 'Informe no encontrado';
  end if;

  if public.report_actor_role(v_report.space_id) <> 'approver' then
    raise exception 'Solo quien puede aprobar informes lo envía';
  end if;

  -- CA-17 · enviar dos veces produce un solo efecto.
  if v_report.status = 'sent' then
    return 0;
  end if;

  -- RN-REP-08 · **lo que faltaba**. Un informe llega a "Enviado" desde
  -- "Aprobado" o desde "Programado", y desde ningún otro sitio.
  if not public.report_transition_allowed(v_report.status, 'sent', 'approver') then
    raise exception 'Un informe en % no se envía: antes se aprueba', v_report.status;
  end if;

  select id into v_version_id
  from public.report_versions
  where report_id = p_report_id
  order by version_number desc
  limit 1;

  if v_version_id is null then
    raise exception 'Este informe todavía no tiene cifras generadas';
  end if;

  -- §95 · el freno de las oportunidades pendientes. Se comprueba AQUÍ y no
  -- al aprobar porque una oportunidad puede detectarse después.
  v_pending := public.report_pending_opportunities(p_report_id);
  if v_pending > 0 then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Hay oportunidades pendientes de aprobar',
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_report.space_id, 'report', p_report_id, v_report.status,
                                      'pending_review', 'Hay oportunidades pendientes de aprobar');

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
    values (v_report.space_id, auth.uid(), 'report.send_blocked', 'report', p_report_id,
            jsonb_build_object('pending_opportunities', v_pending),
            'Hay oportunidades pendientes de aprobar');

    return -1;
  end if;

  v_slug := public.space_slug(v_report.space_id);
  v_link := case
    when v_report.establishment_id is not null
      then '/espacios/' || v_slug || '/restaurantes/' || v_report.establishment_id::text || '/datos?seccion=informes'
    else '/espacios/' || v_slug || '/informes/' || p_report_id::text
  end;

  for v_recipient in select * from public.report_recipients(p_report_id) loop
    insert into public.report_deliveries (space_id, report_id, version_id, recipient_id, channel)
    values (v_report.space_id, p_report_id, v_version_id, v_recipient.recipient_id, 'email')
    on conflict (version_id, recipient_id, channel) do nothing;

    if found then
      v_sent := v_sent + 1;
    end if;

    perform public.emit_notification(
      v_report.space_id, v_recipient.recipient_id, 'report_sent', v_recipient.audience,
      'report', p_report_id, v_link,
      'report_sent:' || v_version_id::text || ':' || v_recipient.recipient_id::text,
      v_report.establishment_id,
      null, null,
      v_report.delivery_channel = 'email'
    );
  end loop;

  update public.reports
  set status = 'sent',
      sent_at = now(),
      status_reason = null,
      updated_at = now()
  where id = p_report_id;

  perform public.record_state_event(v_report.space_id, 'report', p_report_id, v_report.status, 'sent', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_report.space_id, auth.uid(), 'report.sent', 'report', p_report_id,
          jsonb_build_object('version_id', v_version_id, 'recipients', v_sent,
                             'channel', v_report.delivery_channel));

  return v_sent;
end;
$$;

comment on function public.send_report(uuid) is
  '§93/§95 · envía el informe: comprueba la transición (RN-REP-08, desde
   "Aprobado" o "Programado" y no desde un borrador), guarda a quién y qué
   versión, avisa y lo deja en "Enviado". Devuelve -1 y lo devuelve a
   revisión si hay oportunidades pendientes (RN-REP-10); 0 si ya estaba
   enviado (CA-17).';

revoke all on function public.send_report(uuid) from public, anon;
grant execute on function public.send_report(uuid) to authenticated;

-- ============================================================
-- 2 · El restaurante alcanzaba versiones que no se le enviaron
-- ============================================================
--
-- **El agujero.** `report_versions_select` le daba al restaurante
-- **cualquier** versión de un informe que pudiera ver, y el `grant`
-- incluye `snapshot`. Lo que se le envía es **una versión concreta**
-- (RN-REP-12), y las anteriores son conversación interna del equipo
-- mientras se preparaba (RN-REP-13).
--
-- Qué se filtraba en la práctica: el equipo escribe el resumen ejecutivo,
-- lo desmarca para dejar el informe "solo objetivo" y poder programarlo
-- sin aprobación —el camino que la propia suite recorre—, y esa versión
-- intermedia sigue siendo legible con su texto dentro. Lo mismo con una v1
-- que llevaba la sección de oportunidades.
--
-- Hace falta una función `SECURITY DEFINER` y no una subconsulta a
-- `report_deliveries`: esa tabla tiene su propia RLS reservada a quien
-- gestiona la cartera, y dentro de la expresión de una política la
-- subconsulta se evalúa con los privilegios de quien pregunta, así que al
-- restaurante le habría devuelto cero filas y se habría quedado sin ver
-- ninguna versión. Aparece dentro de una política, así que conserva el
-- EXECUTE de `authenticated` (CLAUDE.md).
create or replace function public.report_version_was_delivered(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.report_deliveries d where d.version_id = p_version_id
  );
$$;

comment on function public.report_version_was_delivered(uuid) is
  'RN-REP-12 · si una versión de informe llegó a enviarse. Existe para la
   política de `report_versions`: el restaurante alcanza la versión que se
   le envió y no las anteriores, que son la preparación (RN-REP-13).
   `SECURITY DEFINER` porque `report_deliveries` es del equipo.';

revoke all on function public.report_version_was_delivered(uuid) from public, anon;
grant execute on function public.report_version_was_delivered(uuid) to authenticated;

drop policy report_versions_select on public.report_versions;

create policy report_versions_select on public.report_versions
for select
using (
  public.has_capability(space_id, 'manage_clients')
  or (
    public.report_version_was_delivered(id)
    and exists (
      select 1 from public.reports r
      where r.id = report_versions.report_id
        and r.establishment_id is not null
        and public.report_is_visible_to_client(r.status)
        and public.client_can_view_reports(r.establishment_id)
    )
  )
);

-- Se comprueba con `supabase/tests/informes.sql`.
