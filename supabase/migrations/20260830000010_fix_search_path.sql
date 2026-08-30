-- Corrige un aviso real del linter de seguridad de Supabase
-- (function_search_path_mutable): dos funciones se crearon sin fijar
-- `search_path`, lo que en teoría permite un ataque de secuestro de
-- esquema. Se corrige aquí, en un archivo nuevo, sin tocar la migración
-- original ya aplicada.

create or replace function public.set_establishment_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null then
    new.code := 'EST-' || lpad(public.next_space_sequence(new.space_id, 'establishment')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function public.current_space_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select nullif(current_setting('app.current_space_id', true), '')::uuid;
$$;
