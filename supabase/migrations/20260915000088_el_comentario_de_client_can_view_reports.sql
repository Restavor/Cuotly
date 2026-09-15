-- Fase 3 · Solo un comentario, y por eso se explica.
--
-- El cuerpo de `client_can_view_reports()` lleva dentro una frase de antes
-- de la decisión 30: "el propietario global del grupo ve el consolidado y
-- el detalle de lo suyo". Esa mitad la descartó Bosco el 14/09/2026 — un
-- informe consolidado no se comparte con ningún restaurante, el
-- propietario global incluido— y la función NUNCA hizo lo que el
-- comentario decía: lo del consolidado lo deciden la política
-- `reports_select` y el CHECK `reports_scope`, no esta función.
--
-- No cambia ni una línea de comportamiento, y aun así se hace, porque un
-- comentario que dice la regla contraria dentro de la función que decide
-- quién ve los informes es la clase de trampa con la que este proyecto ya
-- ha tropezado: alguien lo lee, lo implementa, y la fuga entra por ahí. La
-- 85 está aplicada y CLAUDE.md prohíbe modificar una migración existente,
-- así que la única forma de corregirlo es un archivo nuevo.
--
-- El cuerpo se copió con una sustitución mecánica y se comprobó que, sin
-- contar comentarios, el texto es idéntico al de la 85.

create or replace function public.client_can_view_reports(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      -- §14.1 · el propietario global del grupo ve el informe de cada
      -- establecimiento suyo. El CONSOLIDADO no: decisión 30 (14/09/2026),
      -- que resolvió la contradicción que RN-REP-01 tenía dentro. Lo
      -- sostiene la política `reports_select`, que exige
      -- `establishment_id is not null` en la rama del cliente, y el CHECK
      -- `reports_scope`, que ni siquiera admite un informe sin restaurante
      -- que tenga grupo: un consolidado es del espacio.
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id and gm.user_id = auth.uid()
    )
    or exists (
      -- Cualquier rol del restaurante, con el acceso vigente.
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = auth.uid()
        and em.revoked_at is null
    );
$$;

-- `create or replace` conserva los privilegios, así que esto no hace
-- falta; se repite igualmente porque la regla que sostiene es fácil de
-- romper sin querer: esta función aparece dentro de la expresión de
-- `reports_select`, y PostgreSQL evalúa esas expresiones con los
-- privilegios de QUIEN CONSULTA. Revocarle el EXECUTE a `authenticated`
-- no la cierra: rompe la política entera y `reports` empieza a devolver
-- "permission denied for function" (CLAUDE.md).
revoke all on function public.client_can_view_reports(uuid) from public, anon;
grant execute on function public.client_can_view_reports(uuid) to authenticated;

-- Se comprueba con `supabase/tests/informes.sql`, que ya recorre los dos
-- lados de esta función (decisión 28 y decisión 30).
