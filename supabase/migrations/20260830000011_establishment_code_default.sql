-- Ajuste menor: `establishments.code` lo rellena siempre el trigger
-- `establishments_set_code`, nunca quien inserta la fila. Sin un DEFAULT
-- en la columna, el generador de tipos de Supabase la marca como
-- obligatoria en el tipo `Insert`, aunque en la práctica nunca haga falta
-- pasarla. Se añade un DEFAULT '' solo para que el tipo generado sea
-- correcto, y se ajusta el trigger para que también dispare con cadena
-- vacía, no solo con NULL.

alter table public.establishments alter column code set default '';

create or replace function public.set_establishment_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'EST-' || lpad(public.next_space_sequence(new.space_id, 'establishment')::text, 4, '0');
  end if;
  return new;
end;
$$;
