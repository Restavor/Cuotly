-- Imprimir el menú (26/09/2026; RN-MEN-04, RN-MEN-10, §61 paso 4).
--
-- Se pidió un botón de imprimir en el Menú Diario, primero en la
-- pantalla del restaurante y después también en la del equipo. Imprimir
-- es descargar el PDF y mandarlo a la impresora: pasa por
-- `register_menu_download()`, que decide si quien pide puede leer el menú
-- y deja la fila en el historial.
--
-- El problema estaba en la pantalla del equipo. La descarga del
-- trabajador ASIGNADO pasa el menú a "Listo para publicar" (§61 paso 4:
-- descarga la plantilla generada para subirla a LandingSite). Imprimir no
-- es ese paso —nadie sube a la web un papel—, y con la función tal como
-- estaba, el trabajador que imprime el menú para mirarlo lo daba por
-- listo sin querer. Por eso:
--
--   · `register_menu_download()` gana `p_print` (falso por defecto, así
--     que las llamadas de siempre no cambian). Con `p_print`, solo PDF,
--     y el estado del menú NO se toca, sea quien sea quien imprime.
--   · `menu_downloads.printed` deja dicho en el historial que fue una
--     impresión. Sin identidad: se concede la columna como las demás.
--   · El apunte de auditoría lleva `printed`.
--
-- No consume actualización, igual que la descarga (RN-MEN-04).
--
-- La función cambia de firma, así que se borra y se crea. No la llama
-- ninguna otra función ni política; solo la ruta de descarga por RPC.
--
-- Se comprueba con `supabase/tests/menu_diario_descargas_y_plantillas.sql`.

alter table public.menu_downloads
  add column printed boolean not null default false;

comment on column public.menu_downloads.printed is
  'Si la descarga fue para imprimir (el botón Imprimir). Solo PDF, y nunca
   pasa el menú a "Listo para publicar".';

grant select (printed) on public.menu_downloads to authenticated;

drop function public.register_menu_download(uuid, text);

create function public.register_menu_download(p_menu_id uuid, p_format text, p_print boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_menu public.menus;
  v_pub public.menu_publications;
  v_by_team boolean;
  v_id uuid;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if v_menu.id is null or not public.can_read_menu_establishment(v_menu.establishment_id) then
    raise exception 'Menú no encontrado';
  end if;

  if p_format not in ('png', 'pdf') then
    raise exception 'Formato desconocido: %', p_format;
  end if;

  if coalesce(p_print, false) and p_format <> 'pdf' then
    raise exception 'Solo se imprime el PDF';
  end if;

  if v_menu.current_version_id is null then
    raise exception 'El menú no tiene contenido guardado';
  end if;

  if v_menu.template_id is null then
    raise exception 'El menú necesita una plantilla';
  end if;

  v_by_team := public.is_space_member(v_menu.space_id);

  insert into public.menu_downloads
    (space_id, establishment_id, menu_id, version_id, template_id, format, by_team, downloaded_by, printed)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, v_menu.current_version_id, v_menu.template_id,
     p_format, v_by_team, auth.uid(), coalesce(p_print, false))
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.downloaded', 'menu', p_menu_id,
          jsonb_build_object('download_id', v_id, 'format', p_format,
                             'version_id', v_menu.current_version_id, 'template_id', v_menu.template_id,
                             'by_team', v_by_team, 'printed', coalesce(p_print, false)));

  -- §61, paso 4: el trabajador asignado descarga la plantilla generada →
  -- "Listo para publicar". Solo él, solo desde asignado o revisando, y
  -- solo si descarga: imprimir no es preparar la publicación.
  if v_by_team and not coalesce(p_print, false) and v_menu.state in ('assigned', 'reviewing') then
    select * into v_pub from public.menu_publications
    where menu_id = p_menu_id and published_at is null and cancelled_at is null;

    if v_pub.id is not null and v_pub.assigned_to = auth.uid() then
      perform public.record_menu_event(p_menu_id, v_pub.id, v_menu.state, 'ready_to_publish',
                                       'Archivo descargado por el equipo');

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      values (v_menu.space_id, auth.uid(), 'menu.ready_to_publish', 'menu', p_menu_id,
              jsonb_build_object('state', v_menu.state), jsonb_build_object('state', 'ready_to_publish', 'via', 'download'));
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.register_menu_download(uuid, text, boolean) from public, anon;
grant execute on function public.register_menu_download(uuid, text, boolean) to authenticated;
