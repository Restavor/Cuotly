-- ============================================================
-- Limpieza de los datos de prueba del proyecto real (26/09/2026)
-- ============================================================
--
-- NO es una migración ni una semilla: es una operación de una sola vez
-- sobre el proyecto real (`mcajbfxhkxtdhjoyrqha`), pedida por Bosco el
-- 26/09/2026 (decisión 84): "los restaurantes que hay actualmente en la
-- app son pruebas, quiero que borres todos. Limpia la app como si acabase
-- de crearme la cuenta. Pero que no se te olvide que soy el propietario".
-- Queda en el repositorio para que se sepa qué se hizo y cómo.
--
-- Qué decidió Bosco, preguntado:
--   · Se conserva el espacio «Restavor» (slug `restavor`) y sale de
--     Archivados: vuelve a como estaba al crearse, sin archivar.
--   · Se borra entero «Restavor Mantenimiento» (slug `demo`, el espacio
--     que sembraba `supabase/seed/espacio-demo.sql`) y las siete cuentas
--     `@cuotly.test`.
--   · El borrado es **físico, una sola vez**, auditoría incluida. Es la
--     excepción, autorizada por Bosco, al "no borrar físicamente registros
--     de negocio" y a "los registros de auditoría no se borran" de
--     CLAUDE.md: son datos de prueba. Las dos reglas siguen igual para
--     todo lo demás, y por eso esto no vive en una migración.
--
-- Qué se queda del espacio «Restavor»: el espacio, Bosco como propietario,
-- sus planes y su servicio, sus horarios, sus canales de mensajes, el
-- historial de barridos (`scheduled_jobs`) y los apuntes de auditoría de
-- su creación y de su catálogo (`space.created`, `plan.edited`). Todo lo
-- demás de ese espacio era del restaurante «Prueba» o de haberlo
-- archivado, y se va. Los correlativos (`space_sequences`) vuelven a
-- empezar en 1.
--
-- Qué se queda fuera de los espacios: la cuenta de Bosco tal cual (su
-- perfil, su verificación en dos pasos y sus sesiones), así que
-- `is_platform_owner()` sigue siendo cierta para él; y las guías del
-- centro de ayuda (`help_articles`), que no son de ningún espacio.
--
-- Cómo funciona:
--   1. Comprueba que la base es la que se revisó: dos espacios con esos
--      id y slugs, y que toda cuenta que no sea la de Bosco es
--      `@cuotly.test`. Si no, se para sin tocar nada.
--   2. Apaga los disparadores de usuario de `public` (los de libro
--      inmutable, auditoría inmutable y solo-lectura en soporte). Las
--      claves ajenas siguen activas: sus disparadores son internos, así
--      que un borrado que dejara un huérfano falla y lo deshace todo.
--   3. Borra por pasadas: en cada una intenta todas las tablas y deja
--      para la siguiente las que aún tienen hijos. Se para si una pasada
--      no avanza.
--   4. Borra el espacio de pruebas, las cuentas de prueba y los dos
--      apuntes de plataforma que las nombraban, y desarchiva «Restavor».
--   5. Vuelve a encender los disparadores y comprueba el resultado.
--
-- Todo va en un único bloque: o se hace entero o no se hace nada. Con
-- `v_rehearsal := true` hace lo mismo y al final lanza una excepción con
-- el resumen, que lo deshace todo (ensayo).

do $$
declare
  v_rehearsal constant boolean := false;

  v_restavor constant uuid := '09623ee1-09a8-461b-abbf-5b055f806c3b';
  v_demo     constant uuid := 'd1000000-0000-0000-0000-000000000001';
  v_bosco    constant uuid := '316bfc58-6ae7-4137-842a-091f9b4c5f15';

  -- Tablas del espacio «Restavor» cuyas filas eran del restaurante «Prueba»
  -- o de haber archivado el espacio. Todas se vacían para ese espacio.
  v_restavor_wipe constant text[] := array[
    'charges', 'consumption_cycles', 'consumption_entries',
    'establishment_backups', 'establishments', 'financial_entries', 'groups',
    'notification_deliveries', 'notifications', 'plan_commitments',
    'space_lifecycle_operations', 'space_sequences', 'state_events',
    'subscriptions'
  ];

  v_test_users uuid[];
  v_tables text[];
  v_triggered text[];
  v_table text;
  v_where text;
  v_rows bigint;
  v_pass int := 0;
  v_progress boolean;
  v_blocked text[];
  v_deleted jsonb := '{}'::jsonb;
  v_summary text;
begin
  -- 1. La base es la que se revisó --------------------------------------
  if (select email from auth.users where id = v_bosco) is distinct from 'info@restavor.com' then
    raise exception 'La cuenta de Bosco no es la esperada';
  end if;
  if (select slug from public.spaces where id = v_restavor) is distinct from 'restavor'
     or (select slug from public.spaces where id = v_demo) is distinct from 'demo'
     or exists (select 1 from public.spaces where id not in (v_restavor, v_demo)) then
    raise exception 'Los espacios no son los dos que se revisaron';
  end if;
  if exists (select 1 from auth.users where id <> v_bosco and email not like '%@cuotly.test') then
    raise exception 'Hay una cuenta que no es de prueba y no es la de Bosco';
  end if;
  if not exists (
    select 1 from public.space_memberships
    where space_id = v_restavor and user_id = v_bosco and role = 'owner'
  ) then
    raise exception 'Bosco no es propietario del espacio Restavor';
  end if;

  select array_agg(id) into v_test_users from auth.users where email like '%@cuotly.test';

  -- 2. Disparadores de usuario apagados ---------------------------------
  select array_agg(distinct c.relname order by c.relname) into v_triggered
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal;

  foreach v_table in array v_triggered loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;

  -- 3. Filas de los dos espacios, por pasadas ---------------------------
  -- Los accesos al restaurante y al grupo no llevan space_id (los permisos
  -- de cada acceso caen con él, en cascada).
  delete from public.establishment_memberships
  where establishment_id in (select id from public.establishments where space_id in (v_restavor, v_demo));
  delete from public.group_memberships
  where group_id in (select id from public.groups where space_id in (v_restavor, v_demo));

  select array_agg(c.table_name::text order by c.table_name) into v_tables
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'space_id' and c.table_name <> 'spaces';

  loop
    v_pass := v_pass + 1;
    v_progress := false;
    v_blocked := '{}';

    foreach v_table in array v_tables loop
      v_where := case
        when v_table = 'audit_log' then
          format('space_id = %L or (space_id = %L and action not in (''space.created'', ''plan.edited''))',
                 v_demo, v_restavor)
        when v_table = any (v_restavor_wipe) then
          format('space_id in (%L, %L)', v_demo, v_restavor)
        else
          format('space_id = %L', v_demo)
      end;

      begin
        execute format('delete from public.%I where %s', v_table, v_where);
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          v_progress := true;
          v_deleted := v_deleted || jsonb_build_object(
            v_table, coalesce((v_deleted ->> v_table)::bigint, 0) + v_rows);
        end if;
      exception when foreign_key_violation then
        v_blocked := v_blocked || v_table;
      end;
    end loop;

    exit when cardinality(v_blocked) = 0;
    if not v_progress then
      raise exception 'La pasada % no avanza; siguen bloqueadas: %', v_pass, v_blocked;
    end if;
  end loop;

  -- 4. El espacio de pruebas, sus cuentas y «Restavor» desarchivado -----
  delete from public.spaces where id = v_demo;

  delete from public.audit_log
  where space_id is null
    and (actor_id = any (v_test_users) or entity_id = any (v_test_users));
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted || jsonb_build_object('audit_log (plataforma)', v_rows);

  delete from auth.users where id = any (v_test_users);
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted || jsonb_build_object('auth.users', v_rows);

  update public.spaces
  set cuotly_status = null,
      cuotly_status_changed_at = null,
      cuotly_archived_at = null,
      cuotly_reactivation_deadline_at = null,
      cuotly_deletion_scheduled_at = null
  where id = v_restavor;

  -- 5. Disparadores encendidos y resultado ------------------------------
  foreach v_table in array v_triggered loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;

  if (select count(*) from public.spaces) <> 1
     or exists (select 1 from public.establishments)
     or exists (select 1 from public.subscriptions)
     or exists (select 1 from public.requests)
     or exists (select 1 from public.charges)
     or (select count(*) from auth.users) <> 1
     or (select count(*) from public.profiles) <> 1
     or not exists (select 1 from public.profiles where id = v_bosco and lower(email) = 'info@restavor.com')
     or not exists (select 1 from public.space_memberships where space_id = v_restavor and user_id = v_bosco and role = 'owner')
     or (select count(*) from public.space_memberships) <> 1
     or (select cuotly_status from public.spaces where id = v_restavor) is not null
     or exists (
       select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal and t.tgenabled <> 'O'
     ) then
    raise exception 'El resultado no es el esperado; no se ha tocado nada. Borrado: %', v_deleted;
  end if;

  v_summary := format('pasadas=%s borrado=%s', v_pass, v_deleted);
  if v_rehearsal then
    raise exception 'ENSAYO (deshecho): %', v_summary;
  end if;
  raise notice 'Limpieza hecha: %', v_summary;
end;
$$;
