-- Segunda ronda de arreglos del Hito 7, tras auditar los de la migración
-- 20260830000026. Dos de ellos son fallos que introdujo ese propio
-- arreglo — la lección es que un arreglo de seguridad hay que auditarlo
-- como código nuevo, no darlo por bueno porque cierre lo anterior.

-- ============================================================
-- X1 (bloqueante) · la vista barrera nueva era ESCRIBIBLE.
--
-- Mismo fallo que la migración 20260830000027 corrige en `client_jobs`,
-- copiado sin auditarlo al crear client_establishment_status_events: una
-- vista simple es auto-actualizable y, al pertenecer a postgres (con
-- BYPASSRLS en Supabase), escribir por ella se salta el RLS de la tabla
-- base. `state_events` no tiene ninguna política de escritura justamente
-- para que nadie escriba ahí salvo las funciones del servidor.
--
-- Verificado en vivo antes del arreglo: el propietario local de un
-- restaurante BORRÓ con un solo DELETE todos los eventos de estado de su
-- establecimiento. Viola tres MUST de CLAUDE.md a la vez (validar en el
-- servidor, no borrar registros de negocio, y no editar ni borrar
-- auditoría).
revoke all on public.client_establishment_status_events from public, anon, authenticated;
grant select on public.client_establishment_status_events to authenticated;

comment on view public.client_establishment_status_events is
  'RN-EST-08: el restaurante ve los cambios de estado de su propio
   establecimiento y el motivo (por ejemplo, impago), pero no actor_id.

   SOLO LECTURA, y hay que concederlo explícitamente: una vista simple es
   auto-actualizable y escribir por ella se saltaría el RLS de
   state_events. Ver la migración 20260830000028.';

-- ============================================================
-- X2 (bloqueante) · el arreglo de B2 se dejó dos columnas fuera, y encima
-- las reconcedía explícitamente: files.archived_by y
-- files.deletion_requested_by. Las escriben archive_file() (exige
-- 'manage_files') y request_file_permanent_deletion() (exige ser
-- propietario del espacio), así que en la práctica siempre llevan la
-- identidad de alguien del equipo — y el restaurante las leía en
-- cualquier archivo compartido con él.
revoke select on public.files from anon, authenticated;
grant select (id, space_id, group_id, establishment_id, category, visibility, name,
              archived_at, deletion_requested_at, deletion_reason, created_at)
  on public.files to authenticated;

-- ============================================================
-- X7 · las tres funciones de dinero devolvían `null` para un cobro
-- inexistente ANTES de comprobar el permiso, así que distinguían "existe"
-- de "no existe" para cualquiera. Se invierte el orden: primero el
-- permiso, y para eso hace falta resolver el establecimiento, que es lo
-- único que se lee antes.
create or replace function public.charge_outstanding_cents(p_charge_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select establishment_id into v_establishment_id from public.charges where id = p_charge_id;

  -- Un cobro inexistente y uno ajeno responden lo mismo: sin visibilidad
  -- financiera no se distingue si existe.
  if v_establishment_id is null or not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  return (select coalesce(sum(amount_cents), 0)::integer
          from public.financial_entries where charge_id = p_charge_id);
end;
$$;

create or replace function public.charge_collected_cents(p_charge_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  select establishment_id into v_establishment_id from public.charges where id = p_charge_id;

  if v_establishment_id is null or not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  return (select coalesce(-sum(amount_cents), 0)::integer
          from public.financial_entries
          where charge_id = p_charge_id
            and entry_type in ('payment', 'payment_reversal', 'refund'));
end;
$$;

create or replace function public.charge_status(p_charge_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_due_at timestamptz;
  v_establishment_id uuid;
  v_outstanding integer;
begin
  select due_at, establishment_id into v_due_at, v_establishment_id
  from public.charges where id = p_charge_id;

  if v_establishment_id is null or not public.can_read_establishment_finance(v_establishment_id) then
    raise exception 'No tienes visibilidad financiera de este establecimiento';
  end if;

  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'refund') then
    return 'refunded';
  end if;
  if exists (select 1 from public.financial_entries where charge_id = p_charge_id and entry_type = 'waiver') then
    return 'waived';
  end if;

  v_outstanding := public.charge_outstanding_cents(p_charge_id);
  if v_outstanding <= 0 then
    return 'paid';
  end if;

  -- 'overdue' por delante de 'partially_paid': pasada la fecha con deuda
  -- viva, lo que importa es que hay un impago en marcha — es exactamente
  -- la condición que dispara RN-FIN-10/11, y un pago parcial no la detiene.
  if now() > v_due_at then
    return 'overdue';
  end if;

  return case when public.charge_collected_cents(p_charge_id) > 0 then 'partially_paid' else 'pending' end;
end;
$$;

-- ============================================================
-- Bizum · CLAUDE.md ("Sin Stripe: los pagos se registran manualmente
-- (transferencia o Bizum)") nombra Bizum explícitamente como uno de los
-- dos métodos, y el CHECK de `payments` no lo admitía: solo cabía como
-- 'other', que borra justo el dato que la regla quiere conservar.
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('transfer', 'bizum', 'card', 'cash', 'direct_debit', 'other'));
