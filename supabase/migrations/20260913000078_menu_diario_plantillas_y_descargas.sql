-- Fase 2 · Hito 10 · Menú Diario: el diseño de las plantillas y las
-- descargas de PNG y PDF.
--
-- La 77 dejó las plantillas sabiendo solo cuántas hay y de dónde salen
-- (RN-COM-10). Para que un menú se convierta en un PNG o un PDF hace
-- falta que la plantilla diga cómo se ve: eso son las columnas de diseño
-- de aquí. Y §59 y §64 piden dos cosas de la descarga: que NO consuma
-- actualización (RN-MEN-04) y que quede en el historial (RN-MEN-10). Eso
-- es `menu_downloads` y `register_menu_download()`.
--
-- **Lo que es una plantilla, y lo que no se inventa.** La maestra dice
-- "tres plantillas personalizadas" y no describe ninguna: son del
-- restaurante, las hace el equipo. Cuotly guarda lo que hace falta para
-- pintar el menú: una disposición (`layout`) entre tres que ofrece la
-- aplicación —`classic`, `board` y `elegant`—, los tres colores (fondo,
-- texto, acento), el texto de cabecera (por omisión, el nombre del
-- restaurante), un pie y si se enseñan los precios. Las tres
-- disposiciones son una decisión de implementación del Hito 10, no una
-- regla de producto: cambiarlas o añadir una es una migración y un
-- componente, sin tocar ninguna regla. Los colores se guardan como
-- hexadecimal porque son la marca del RESTAURANTE, no de Cuotly: la regla
-- de "solo tokens de Emerald Control" es de los componentes de la
-- aplicación, y el menú de un cliente no es uno.
--
-- **La descarga del trabajador es "Listo para publicar" (§61, paso 4).**
-- `register_menu_download()` la registra y, si quien descarga es el
-- asignado de la publicación viva y el menú está asignado o revisándose,
-- lo pasa a `ready_to_publish` con ese motivo. La descarga del
-- restaurante no cambia nada: es su menú, se lo lleva cuando quiera.
--
-- Se comprueba con `supabase/tests/menu_diario_descargas_y_plantillas.sql`.

-- ============================================================
-- 1 · El diseño de una plantilla
-- ============================================================
alter table public.menu_templates
  add column layout text not null default 'classic' check (layout in ('classic', 'board', 'elegant')),
  add column background_color text not null default '#FFFFFF' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column text_color text not null default '#1F2937' check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column accent_color text not null default '#145C4E' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column heading_text text check (heading_text is null or length(heading_text) <= 80),
  add column footer_text text check (footer_text is null or length(footer_text) <= 200),
  add column show_prices boolean not null default true,
  add column design_updated_at timestamptz;

comment on column public.menu_templates.layout is
  'Una de las tres disposiciones que pinta la aplicación (Hito 10). Es
   implementación, no regla: ampliarla es una migración y un componente.';

comment on column public.menu_templates.heading_text is
  'Cabecera del menú. Null quiere decir "el nombre del restaurante".';

-- CLAUDE.md · el privilegio de columna de esta tabla se enumeró entero
-- en la 77, así que las columnas nuevas no se conceden solas.
grant select (layout, background_color, text_color, accent_color, heading_text, footer_text,
              show_prices, design_updated_at)
  on public.menu_templates to authenticated;

create or replace function public.update_menu_template_design(
  p_template_id uuid,
  p_layout text,
  p_background_color text,
  p_text_color text,
  p_accent_color text,
  p_heading_text text default null,
  p_footer_text text default null,
  p_show_prices boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.menu_templates;
begin
  select * into v_row from public.menu_templates where id = p_template_id for update;
  if v_row.id is null then
    raise exception 'Plantilla no encontrada';
  end if;

  -- Quien crea la plantilla es quien la diseña: el equipo (RN-MEN-11).
  if not public.has_capability(v_row.space_id, 'manage_clients') then
    raise exception 'No tienes permiso para diseñar plantillas de Menú Diario';
  end if;

  if v_row.archived_at is not null then
    raise exception 'Una plantilla archivada no se rediseña: crea otra';
  end if;

  update public.menu_templates
  set layout = p_layout,
      background_color = upper(p_background_color),
      text_color = upper(p_text_color),
      accent_color = upper(p_accent_color),
      heading_text = nullif(btrim(p_heading_text), ''),
      footer_text = nullif(btrim(p_footer_text), ''),
      show_prices = coalesce(p_show_prices, true),
      design_updated_at = now()
  where id = p_template_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_row.space_id, auth.uid(), 'menu_template.design_updated', 'menu_template', p_template_id,
          jsonb_build_object('layout', v_row.layout, 'background_color', v_row.background_color,
                             'text_color', v_row.text_color, 'accent_color', v_row.accent_color,
                             'heading_text', v_row.heading_text, 'footer_text', v_row.footer_text,
                             'show_prices', v_row.show_prices),
          jsonb_build_object('layout', p_layout, 'background_color', upper(p_background_color),
                             'text_color', upper(p_text_color), 'accent_color', upper(p_accent_color),
                             'heading_text', nullif(btrim(p_heading_text), ''),
                             'footer_text', nullif(btrim(p_footer_text), ''),
                             'show_prices', coalesce(p_show_prices, true)));
end;
$$;

revoke all on function public.update_menu_template_design(uuid, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.update_menu_template_design(uuid, text, text, text, text, text, text, boolean) to authenticated;

-- ============================================================
-- 2 · Las descargas (RN-MEN-04, RN-MEN-10)
-- ============================================================
create table public.menu_downloads (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  menu_id uuid not null references public.menus (id) on delete cascade,
  version_id uuid not null references public.menu_versions (id),
  template_id uuid not null references public.menu_templates (id),
  format text not null check (format in ('png', 'pdf')),
  -- Si la descarga la hizo el equipo (el trabajador que va a publicar) o
  -- el restaurante. Lo que el cliente puede saber sin ninguna identidad.
  by_team boolean not null,
  downloaded_by uuid not null references public.profiles (id),
  downloaded_at timestamptz not null default now()
);

comment on table public.menu_downloads is
  'RN-MEN-10 · cada descarga de PNG o PDF de un menú, con la versión y la
   plantilla exactas que se llevó. RN-MEN-04: no toca el libro de
   actualizaciones. Solo la escribe register_menu_download().';

alter table public.menu_downloads enable row level security;

create index menu_downloads_menu_idx on public.menu_downloads (menu_id, downloaded_at);

create policy menu_downloads_select on public.menu_downloads
for select using (
  public.can_read_menu_establishment((select m.establishment_id from public.menus m where m.id = menu_id))
);

-- Quién descargó puede ser alguien del equipo: privilegio de columna.
revoke select on public.menu_downloads from anon, authenticated;
grant select (id, space_id, establishment_id, menu_id, version_id, template_id, format, by_team, downloaded_at)
  on public.menu_downloads to authenticated;

create or replace function public.register_menu_download(p_menu_id uuid, p_format text)
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

  if v_menu.current_version_id is null then
    raise exception 'El menú no tiene contenido guardado';
  end if;

  if v_menu.template_id is null then
    raise exception 'El menú necesita una plantilla';
  end if;

  v_by_team := public.is_space_member(v_menu.space_id);

  insert into public.menu_downloads
    (space_id, establishment_id, menu_id, version_id, template_id, format, by_team, downloaded_by)
  values
    (v_menu.space_id, v_menu.establishment_id, p_menu_id, v_menu.current_version_id, v_menu.template_id,
     p_format, v_by_team, auth.uid())
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_menu.space_id, auth.uid(), 'menu.downloaded', 'menu', p_menu_id,
          jsonb_build_object('download_id', v_id, 'format', p_format,
                             'version_id', v_menu.current_version_id, 'template_id', v_menu.template_id,
                             'by_team', v_by_team));

  -- §61, paso 4: el trabajador asignado descarga la plantilla generada →
  -- "Listo para publicar". Solo él, y solo desde asignado o revisando.
  if v_by_team and v_menu.state in ('assigned', 'reviewing') then
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

revoke all on function public.register_menu_download(uuid, text) from public, anon;
grant execute on function public.register_menu_download(uuid, text) to authenticated;

-- El apunte de auditoría de una descarga lo decide la fila del menú,
-- como el resto de acciones `menu.*` (77, §11). Nada que cambiar.
