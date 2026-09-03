-- El aviso de consumo de bolsa (§18, filas del 80 % y del 100 %) pasa a
-- ser SOLO del restaurante.
--
-- Por qué existe esta migración: la fila del §18 sobre el consumo de bolsa
-- describe los umbrales en su segunda columna y **no dice a quién se
-- avisa**. La migración 41 resolvió ese silencio aplicando RN-NOT-02 ("los
-- propietarios reciben todo por defecto") y avisaba a dos audiencias: a
-- los miembros del establecimiento y, además, al propietario y a los
-- administradores del espacio. Quedó anotado en el ROADMAP como un matiz
-- que había que confirmar, porque no estaba escrito en ninguna parte.
--
-- Decisión de Bosco, 03/09/2026: **se avisa al restaurante**. La bolsa es
-- suya y quien tiene que reaccionar es él; el equipo lo ve en la ficha del
-- establecimiento cuando entra, sin necesidad de un aviso por cada
-- categoría de cada ciclo.
--
-- Lo único que cambia es a quién se emite. Los umbrales, el cálculo desde
-- el libro de apuntes y la clave de deduplicación se quedan exactamente
-- como estaban: los avisos ya emitidos al equipo no se tocan (son
-- historial, CLAUDE.md MUST NOT), simplemente dejan de emitirse nuevos.
create or replace function public.run_consumption_thresholds(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila record;
  v_recipient uuid;
  v_slug text;
  v_umbral integer;
  v_emitidos integer := 0;
begin
  v_slug := public.space_slug(p_space_id);

  for v_fila in
    with ciclo as (
      select cc.id, cc.establishment_id, cc.included_small, cc.included_photo,
             cc.included_medium, cc.included_large
      from public.consumption_cycles cc
      join public.subscriptions s on s.id = cc.subscription_id
      join public.establishments e on e.id = cc.establishment_id
      where cc.space_id = p_space_id
        and s.kind = 'plan' and s.status = 'active'
        and e.status not in ('archived', 'suspended')
        and now() >= cc.cycle_start and now() < cc.cycle_end
    ),
    incluido as (
      select id, establishment_id, 'small' as category, included_small as included from ciclo
      union all select id, establishment_id, 'photo', included_photo from ciclo
      union all select id, establishment_id, 'medium', included_medium from ciclo
      union all select id, establishment_id, 'large', included_large from ciclo
    )
    select
      i.id as cycle_id,
      i.establishment_id,
      i.category,
      i.included,
      -- Consumido = lo que han restado los débitos, neteado con las
      -- devoluciones y los créditos. Sale del libro, no de un contador.
      greatest(0, i.included - (i.included + coalesce((
        select sum(ce.amount) from public.consumption_entries ce
        where ce.consumption_cycle_id = i.id and ce.category = i.category
      ), 0)))::integer as consumido
    from incluido i
    where i.included > 0
  loop
    v_umbral := case
      when v_fila.consumido >= v_fila.included then 100
      when v_fila.consumido * 100 >= v_fila.included * 80 then 80
      else null
    end;

    if v_umbral is null then
      continue;
    end if;

    -- Una sola audiencia: el restaurante. `establishment_memberships` son
    -- las personas del cliente con acceso vivo a ese establecimiento.
    for v_recipient in
      select em.user_id from public.establishment_memberships em
      where em.establishment_id = v_fila.establishment_id and em.revoked_at is null
    loop
      if public.emit_notification(
           p_space_id, v_recipient,
           ('consumption_threshold_' || v_umbral)::text, 'client', 'establishment',
           v_fila.establishment_id,
           '/espacios/' || v_slug || '/restaurantes/' || v_fila.establishment_id::text,
           'consumption_threshold_' || v_umbral || ':' || v_fila.cycle_id::text || ':' || v_fila.category,
           v_fila.establishment_id, v_umbral) is not null then
        v_emitidos := v_emitidos + 1;
      end if;
    end loop;
  end loop;

  return v_emitidos;
end;
$$;

comment on function public.run_consumption_thresholds(uuid) is
  '§18 · avisos de bolsa al 80 % y al 100 %. Destinatario: el restaurante,
   y solo él (decisión de Bosco, 03/09/2026). El consumo se calcula desde
   el libro de apuntes, nunca desde un contador (CA-08).';

-- Función interna: la despacha la cola, no una pantalla. CLAUDE.md exige
-- revocar también a anon y authenticated, no solo a public: Supabase
-- concede EXECUTE por defecto a los dos sobre toda función nueva, y
-- `create or replace` sobre una función ya revocada conserva sus
-- privilegios — pero repetirlo aquí cuesta una línea y protege del día en
-- que alguien la recree desde cero.
revoke all on function public.run_consumption_thresholds(uuid) from public, anon, authenticated;
