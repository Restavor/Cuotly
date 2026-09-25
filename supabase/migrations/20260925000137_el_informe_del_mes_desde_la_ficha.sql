-- Fase 3 · Hito 16 · el informe del mes desde la ficha del restaurante
-- (decisión 78, PRD RN-REP-27 a RN-REP-30).
--
-- Bosco, 25/09/2026: "yo le doy a generar informe y me crea ya con todo lo
-- que ha pasado este mes, y luego me tienen que aparecer dos botones: subir
-- informe (para que lo vea el restaurante) y otro para revisar informe".
--
-- Generar no necesita nada nuevo aquí: es `create_report_draft()` con la
-- clave de idempotencia de la biblioteca, y la versión la escribe
-- `generate_report_version()`. Lo que sí es nuevo son dos puertas:
--
--   1 · `report_entry_texts` y `set_report_entry_texts()` · los textos
--       editables de "Lo que ha pasado este mes" (RN-REP-30).
--   2 · `publish_report()` · "Subir informe": aprobar y enviar en una sola
--       transacción, exigiendo la confirmación cuando nadie lo aprobó
--       antes, y por el canal que arrastra el push (RN-REP-29).
--
-- El resumen ejecutivo automático (RN-REP-28) no toca la base: se escribe
-- con frases fijas al generar la versión, en `src/services/`, y lo que
-- reescribe una persona se guarda donde ya se guardaba, en
-- `report_sections.note`.

-- ============================================================
-- 1 · Los textos editables del relato del mes (RN-REP-30)
-- ============================================================
create table public.report_entry_texts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  report_id uuid not null references public.reports (id) on delete cascade,
  -- Qué cosa del relato es. La calcula `src/core/reports.ts`
  -- (`changeEntryKey`, `activityEntryKey`): `change:<código>` para la ficha
  -- de un cambio y `entry:<clase>:<fecha>:<sujeto>` para una línea suelta.
  entry_key text not null check (entry_key ~ '^(change|entry):.+' and length(entry_key) <= 300),
  -- Nulo = el texto original. Una persona lo escribe y el restaurante lo
  -- lee: sin límite de contenido que una máquina pueda comprobar (P7 lo
  -- recuerda la pantalla), pero sí de tamaño.
  title text check (title is null or length(title) <= 300),
  body text check (body is null or length(body) <= 4000),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (report_id, entry_key)
);

comment on table public.report_entry_texts is
  'RN-REP-30 · lo que el equipo reescribe de "Lo que ha pasado este mes"
   antes de subir el informe: el título y la descripción de cada cambio y
   el texto de cada línea. La FILA es preparación del equipo —como
   `report_sections`—, así que el restaurante no la ve nunca: lo que ve es
   la versión subida, con el texto ya puesto. No toca el dato de origen.';

alter table public.report_entry_texts enable row level security;

create index report_entry_texts_report_idx on public.report_entry_texts (report_id);

-- La misma política de lectura que `report_sections`: quien gestiona la
-- cartera. El cliente queda fuera de la fila (P7), no de una columna.
-- Sin INSERT, UPDATE ni DELETE: todo pasa por `set_report_entry_texts()`.
create policy report_entry_texts_select on public.report_entry_texts
for select
using (public.has_capability(space_id, 'manage_clients'));

-- CLAUDE.md · Modo soporte mira, no toca (RN-ADM-07)…
create trigger report_entry_texts_guard_support_read_only
  before insert or update or delete on public.report_entry_texts
  for each row execute function public.guard_support_read_only();

-- …y un espacio archivado por impago está congelado (RN-SUB-08): editar un
-- informe no es pagar, ni exportar, ni hablar con soporte.
create trigger report_entry_texts_cuotly_read_only
  before insert or update or delete on public.report_entry_texts
  for each row execute function public.guard_space_read_only();

-- Guarda los textos de una tanda. Cada elemento es
-- `{ "key": "...", "title": "..." | null, "body": "..." | null }`; un texto
-- vacío o nulo vuelve al original. No borra filas (CLAUDE.md): las deja
-- con los dos textos a nulo.
create or replace function public.set_report_entry_texts(
  p_report_id uuid,
  p_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_item jsonb;
  v_key text;
  v_title text;
  v_body text;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_old record;
  v_changed boolean := false;
begin
  select space_id, status into v_space_id, v_status
  from public.reports where id = p_report_id for update;

  if v_space_id is null then
    raise exception 'Informe no encontrado';
  end if;

  -- Los mismos que editan las secciones (RN-REP-08): quien gestiona la
  -- cartera. El trabajador no entra en los informes de un restaurante.
  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'No puedes editar los informes de este espacio';
  end if;

  if v_status in ('sent', 'archived') then
    raise exception 'Un informe % no se edita', v_status;
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Los textos del informe llegan como una lista';
  end if;

  for v_item in select * from jsonb_array_elements(p_entries) loop
    v_key := v_item ->> 'key';
    if v_key is null or v_key !~ '^(change|entry):.+' or length(v_key) > 300 then
      raise exception 'Esa entrada del informe no existe';
    end if;
    v_title := nullif(btrim(coalesce(v_item ->> 'title', '')), '');
    v_body := nullif(btrim(coalesce(v_item ->> 'body', '')), '');

    select title, body into v_old
    from public.report_entry_texts
    where report_id = p_report_id and entry_key = v_key;

    if found then
      if v_old.title is not distinct from v_title and v_old.body is not distinct from v_body then
        continue;
      end if;
      v_before := v_before || jsonb_build_object('key', v_key, 'title', v_old.title, 'body', v_old.body);
      update public.report_entry_texts
      set title = v_title, body = v_body, updated_by = auth.uid(), updated_at = now()
      where report_id = p_report_id and entry_key = v_key;
    else
      -- Nada que guardar: no se crea una fila para decir "el original".
      if v_title is null and v_body is null then
        continue;
      end if;
      insert into public.report_entry_texts (space_id, report_id, entry_key, title, body, updated_by)
      values (v_space_id, p_report_id, v_key, v_title, v_body, auth.uid());
    end if;

    v_after := v_after || jsonb_build_object('key', v_key, 'title', v_title, 'body', v_body);
    v_changed := true;
  end loop;

  -- RN-DAT-09 · guardar lo mismo dos veces no escribe dos apuntes.
  if not v_changed then
    return;
  end if;

  -- RN-REP-09 · editar un informe aprobado lo devuelve a revisión: lo
  -- aprobado era un texto concreto y este ya es otro.
  if v_status in ('approved', 'scheduled') then
    update public.reports
    set status = 'pending_review',
        status_reason = 'Se editaron los textos después de aprobar',
        approved_at = null,
        approved_by = null,
        scheduled_for = null,
        reminder_sent_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_report_id;

    perform public.record_state_event(v_space_id, 'report', p_report_id, v_status, 'pending_review',
                                      'Se editaron los textos después de aprobar');
  else
    update public.reports
    set updated_by = auth.uid(), updated_at = now()
    where id = p_report_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'report.entry_texts_changed', 'report', p_report_id,
          jsonb_build_object('entries', v_before), jsonb_build_object('entries', v_after));
end;
$$;

comment on function public.set_report_entry_texts(uuid, jsonb) is
  'RN-REP-30 · reescribir el título y la descripción de un cambio, o el
   texto de una línea, de "Lo que ha pasado este mes". Comprueba
   manage_clients; lo enviado no se edita; lo aprobado vuelve a revisión.';

revoke all on function public.set_report_entry_texts(uuid, jsonb) from public, anon;
grant execute on function public.set_report_entry_texts(uuid, jsonb) to authenticated;

-- ============================================================
-- 2 · "Subir informe" (RN-REP-29)
-- ============================================================
--
-- Aprobar y enviar son dos pasos de §95 que desde la ficha se dan con un
-- botón. Se hacen aquí, en una función, para que sean UNA transacción: si
-- el envío falla, la aprobación tampoco queda (CLAUDE.md, operaciones
-- críticas).
--
-- Devuelve lo mismo que `send_report()`: cuántas entregas escribió, 0 si
-- ya estaba enviado, y -1 si lo paró el freno de las oportunidades.
create or replace function public.publish_report(
  p_report_id uuid,
  p_confirm_unreviewed boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_reason constant text := 'Subido sin revisar';
begin
  select * into v_report from public.reports where id = p_report_id for update;

  if v_report.id is null then
    raise exception 'Informe no encontrado';
  end if;

  -- Una persona, no la cola: la cola envía lo programado con `send_report`.
  -- Sin esto, `report_actor_role()` diría 'approver' a una llamada sin
  -- sesión, que es su lectura para la cola y no para este botón.
  if auth.uid() is null then
    raise exception 'Subir un informe lo hace una persona';
  end if;

  if public.report_actor_role(v_report.space_id) is distinct from 'approver' then
    raise exception 'Solo quien puede aprobar informes lo sube';
  end if;

  -- CA-17 · subir dos veces es subirlo una.
  if v_report.status = 'sent' then
    return 0;
  end if;

  if v_report.status = 'archived' then
    raise exception 'Un informe archivado no se sube';
  end if;

  -- Decisión 30 · un consolidado mezcla varios restaurantes y no es de
  -- ninguno: no hay a quién subírselo.
  if v_report.establishment_id is null then
    raise exception 'Un informe consolidado no se sube a ningún restaurante';
  end if;

  -- RN-REP-29 · sin aprobar, solo con la confirmación. La exige el
  -- servidor: la alerta de la pantalla es cómo se pide, no el control.
  if v_report.status in ('preparing', 'pending_review') then
    if not coalesce(p_confirm_unreviewed, false) then
      raise exception 'Este informe no se ha revisado: confirma que quieres subirlo sin revisar';
    end if;
    -- Confirmar ES la aprobación de quien pulsa, con su evento, su apunte
    -- y su motivo (RN-REP-14). `set_report_status()` comprueba la tabla de
    -- transiciones y que haya cifras generadas.
    perform public.set_report_status(p_report_id, 'approved', v_reason);
  end if;

  -- RN-REP-11 y RN-MOV-04 · el aviso al restaurante lleva push, y el push
  -- viaja con el canal de correo: con 'none' solo saldría la campana.
  if v_report.delivery_channel <> 'email' then
    update public.reports
    set delivery_channel = 'email', updated_by = auth.uid(), updated_at = now()
    where id = p_report_id;

    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_report.space_id, auth.uid(), 'report.channel_changed', 'report', p_report_id,
            jsonb_build_object('channel', v_report.delivery_channel), jsonb_build_object('channel', 'email'));
  end if;

  -- El resto es el envío de siempre: la tabla de transiciones, la versión
  -- más reciente, el freno de las oportunidades (RN-REP-10), las entregas
  -- y los avisos a todos los que trabajan en ese restaurante.
  return public.send_report(p_report_id);
end;
$$;

comment on function public.publish_report(uuid, boolean) is
  'RN-REP-29 · "Subir informe" desde la ficha: aprueba (si nadie lo aprobó,
   solo con la confirmación) y envía en una transacción, con aviso y push.
   Solo quien tiene "Aprobar informes". Idempotente: lo enviado devuelve 0.';

revoke all on function public.publish_report(uuid, boolean) from public, anon;
grant execute on function public.publish_report(uuid, boolean) to authenticated;
