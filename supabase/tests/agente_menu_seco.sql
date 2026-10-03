-- Agente Menú Diario · la prueba en seco solo lee (Fase 1, paso 1.4;
-- decisión 151; criterio de aceptación de la Fase 1 en agents/menu-diario/PRD.md §14:
-- «agente:seco no escribe nada»).
--
-- Qué fija. `pnpm agente:seco` (agents/menu-diario) llama a UNA función de
-- Restavor web, `team_menu_queue`, y lee cuatro tablas: `spaces`,
-- `establishments`, `worker_establishments` y `menus`. Para que «no escribe
-- nada» sea cierto, ninguna de esas lecturas puede escribir por ningún camino.
-- Este test es lo que lo sostiene del lado de la base. Del lado del robot lo
-- sostienen la puerta de solo lectura (`src/services/read-only-gate.ts`), el
-- lint y el recuento de filas antes y después que hace una conexión privilegiada
-- ajena al robot.
--
--   · Una función STABLE no puede ejecutar por sí misma un INSERT, un UPDATE
--     ni un DELETE: PostgreSQL lo rechaza («... is not allowed in a
--     non-volatile function»). Pero SÍ puede llamar por SELECT a otra función
--     que sea VOLATILE y que escriba. «STABLE» a secas no es garantía: hay que
--     mirar toda la cadena de funciones que se ejecutan al leer.
--
--   · La cadena no se escribe a mano (una lista escrita a mano se queda vieja
--     sin que nadie lo note: CLAUDE.md). Se calcula leyendo los cuerpos. Parte
--     de `team_menu_queue`, de `menu_deadlines` (la usará el agente en fases
--     siguientes) y de las funciones que aparecen en las políticas de lectura
--     de las cuatro tablas (PostgreSQL las evalúa en cada lectura), y añade
--     cada función de `public` cuyo nombre aparece seguido de «(» en el cuerpo
--     de otra de la cadena. Es conservador a propósito: si un nombre aparece
--     en un comentario, la función entra igual y se le exige lo mismo.
--
--   · Es falso-cerrado: falla también cuando el cálculo no puede asegurar lo
--     que mira. Si la cadena calculada no incluye las dos funciones que hoy
--     son su columna vertebral (el cálculo se habría roto y todo «pasaría»
--     sin mirar nada), si una función de la cadena nombra una vista (el
--     cálculo no mira dentro de las vistas), si ejecuta SQL dinámico (no se
--     sabe qué llama) o si llama a una de las funciones del sistema que
--     escriben fuera de las tablas (`nextval`, `pg_notify`...).
--
-- Las dos listas de abajo (`c_raices` y `c_tablas`) están ligadas a la puerta
-- de solo lectura: `agents/menu-diario/tests/seco-sql.test.ts` falla si las
-- tablas o las funciones de la puerta no coinciden con ellas.
--
-- No escribe nada ni necesita datos: lee solo el catálogo y crea una tabla
-- temporal que desaparece sola.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agente_menu_seco.sql

do $$
declare
  -- Las funciones que el agente llama (o llamará) por RPC.
  c_raices constant text[] := array['team_menu_queue', 'menu_deadlines'];
  -- Las tablas que el agente lee.
  c_tablas constant text[] := array['spaces', 'establishments', 'worker_establishments', 'menus'];
  -- Lo que hoy es la columna vertebral de la cadena: la comprobación de «es del
  -- equipo» y la de «puede ver los menús de este restaurante».
  c_esperadas constant text[] := array['is_space_member', 'can_read_menu_establishment'];
  -- Funciones del sistema que escriben fuera de las tablas y que una función
  -- STABLE puede llamar sin que PostgreSQL lo impida.
  c_efectos constant text :=
    '\m(nextval|setval|pg_notify|set_config|dblink[a-z_]*|pg_advisory_[a-z_]*|lo_[a-z_]+|txid_[a-z_]+|pg_terminate_backend|pg_cancel_backend)\s*\(';
  v_raiz text;
  v_total integer;
  v_lista text;
  v_falta text;
  v_volatiles text;
  v_vistas text;
  v_dinamicas text;
  v_efectos text;
begin
  -- 1. Las funciones de partida existen. Si una cambia de nombre, el agente
  --    llamará a otra y este test tiene que enterarse.
  foreach v_raiz in array c_raices loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_raiz
    ) then
      raise exception 'FALLIDO: la función public.% ya no existe. Si el agente llama ahora a otra, hay que cambiar este test y la lista de la puerta de solo lectura', v_raiz
        using errcode = 'assert_failure';
    end if;
  end loop;

  -- 2. La cadena: todo lo que se ejecuta al llamar a las funciones de partida
  --    y al leer las cuatro tablas. `via` dice quién la hizo entrar.
  create temporary table cadena_seco (
    oid oid not null,
    via text not null,
    primary key (oid, via)
  ) on commit drop;

  insert into cadena_seco (oid, via)
  with recursive
  fn as (
    select p.oid, p.proname,
           case when p.prosqlbody is not null then pg_get_functiondef(p.oid) else p.prosrc end as texto
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  ),
  raices as (
    select f.oid, 'raíz'::text as via
      from fn f
     where f.proname = any (c_raices)
    union
    select f.oid, ('política de ' || c.relname)::text
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'public'
      join fn f on (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                    coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~* ('\m' || f.proname || '\s*\(')
     where c.relname = any (c_tablas)
       and pol.polcmd in ('r', '*')
  ),
  alcance (oid, via) as (
    select r.oid, r.via from raices r
    union
    select g.oid, ap.proname::text
      from alcance a
      join fn ap on ap.oid = a.oid
      join fn g on g.oid <> a.oid and ap.texto ~* ('\m' || g.proname || '\s*\(')
  )
  select a.oid, a.via from alcance a;

  -- Una fila por función de la cadena, con su texto, para las comprobaciones.
  create temporary table cadena_fn on commit drop as
  select f.oid, f.proname, f.provolatile, f.lanname, f.texto,
         (select string_agg(distinct c.via, ', ' order by c.via) from cadena_seco c where c.oid = f.oid) as entra_por
    from (
      select p.oid, p.proname, p.provolatile, l.lanname,
             case when p.prosqlbody is not null then pg_get_functiondef(p.oid) else p.prosrc end as texto
        from pg_proc p
        join pg_language l on l.oid = p.prolang
       where p.oid in (select s.oid from cadena_seco s)
    ) f;

  select count(*), string_agg(distinct f.proname, ', ' order by f.proname)
    into v_total, v_lista
    from cadena_fn f;

  -- 3. El cálculo funciona: la cadena incluye lo que hoy la sostiene.
  select string_agg(e, ', ' order by e) into v_falta
    from unnest(c_esperadas) e
   where not exists (select 1 from cadena_fn f where f.proname = e);
  if v_falta is not null then
    raise exception 'FALLIDO: la cadena calculada no incluye %. O esas funciones ya no se usan al leer (hay que actualizar este test) o el cálculo de la cadena se ha roto y el test estaría mirando de menos. Cadena calculada (% funciones): %',
      v_falta, v_total, v_lista
      using errcode = 'assert_failure';
  end if;

  -- 4. Ninguna función de la cadena es VOLATILE: es lo que impide que la
  --    lectura escriba.
  select string_agg(f.proname || ' (entra por: ' || f.entra_por || ')', '; ' order by f.proname)
    into v_volatiles
    from cadena_fn f
   where f.provolatile = 'v';
  if v_volatiles is not null then
    raise exception 'FALLIDO: la lectura del agente pasa por funciones VOLATILE, que pueden escribir: %. La prueba en seco (agents/menu-diario) deja de ser de solo lectura. Hay que volverlas STABLE o sacarlas de la cadena', v_volatiles
      using errcode = 'assert_failure';
  end if;

  -- 5. Ninguna función de la cadena (ni política de las cuatro tablas) nombra
  --    una vista: el cálculo no mira dentro de las vistas y lo que llamen
  --    quedaría sin comprobar.
  select string_agg(distinct v.relname, ', ' order by v.relname) into v_vistas
    from (
      select f.texto from cadena_fn f
      union all
      select coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        from pg_policy pol
        join pg_class tc on tc.oid = pol.polrelid
        join pg_namespace tn on tn.oid = tc.relnamespace and tn.nspname = 'public'
       where tc.relname = any (c_tablas) and pol.polcmd in ('r', '*')
    ) t (texto)
    join pg_class v on v.relkind in ('v', 'm')
    join pg_namespace vn on vn.oid = v.relnamespace and vn.nspname = 'public'
   where t.texto ~* ('\m' || v.relname || '\M');
  if v_vistas is not null then
    raise exception 'FALLIDO: la lectura del agente pasa ahora por las vistas %. Este test no mira dentro de las vistas: hay que ampliarlo antes de dar la prueba en seco por solo lectura', v_vistas
      using errcode = 'assert_failure';
  end if;

  -- 6. Ninguna función de la cadena ejecuta SQL dinámico (`execute`): no se
  --    puede saber qué llama.
  select string_agg(f.proname, ', ' order by f.proname) into v_dinamicas
    from cadena_fn f
   where f.lanname = 'plpgsql' and f.texto ~* '\mexecute\M';
  if v_dinamicas is not null then
    raise exception 'FALLIDO: la lectura del agente pasa por funciones que ejecutan SQL dinámico (%). No se puede comprobar qué llaman: hay que quitarlo o ampliar este test', v_dinamicas
      using errcode = 'assert_failure';
  end if;

  -- 7. Ninguna función de la cadena llama a una función del sistema que
  --    escribe fuera de las tablas.
  select string_agg(f.proname, ', ' order by f.proname) into v_efectos
    from cadena_fn f
   where f.texto ~* c_efectos;
  if v_efectos is not null then
    raise exception 'FALLIDO: la lectura del agente pasa por funciones que llaman a una función del sistema con efectos (%): nextval, pg_notify, set_config... Una STABLE puede llamarlas sin que PostgreSQL lo impida', v_efectos
      using errcode = 'assert_failure';
  end if;

  raise notice 'Cadena de lectura del agente (% funciones, todas de solo lectura): %', v_total, v_lista;
end $$;

select 'agente_menu_seco.sql: todas las comprobaciones han pasado' as resultado;
