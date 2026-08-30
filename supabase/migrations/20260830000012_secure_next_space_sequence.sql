-- Corrige un hallazgo bloqueante de la auditoría del Hito 2: next_space_sequence()
-- era SECURITY DEFINER sin ninguna comprobación de pertenencia al espacio, así
-- que cualquier usuario autenticado podía mutar el contador de un espacio ajeno
-- llamando a la función directamente por RPC (CLAUDE.md: "toda operación se
-- valida en el servidor... el cliente nunca es la autoridad"). Verificado en
-- vivo contra el proyecto real antes de este arreglo: un usuario sin
-- membresía en el espacio B conseguía incrementar space_sequences de B.
--
-- Se sustituye con CREATE OR REPLACE en un archivo nuevo — la migración
-- original (20260830000003) nunca se toca, tal como exige CLAUDE.md.

create or replace function public.next_space_sequence(p_space_id uuid, p_sequence_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value bigint;
begin
  if not public.is_space_member(p_space_id) then
    raise exception 'No perteneces a este espacio';
  end if;

  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (p_space_id, p_sequence_name, 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_value;
  return v_value;
end;
$$;

comment on function public.next_space_sequence(uuid, text) is
  'Generador atómico de correlativos por espacio (RN-DAT-01). Comprueba
   is_space_member() antes de mutar nada: al ser SECURITY DEFINER salta el
   RLS de space_sequences a propósito, así que la autorización tiene que
   vivir aquí dentro, no solo en la tabla (que no tiene ninguna política).';
