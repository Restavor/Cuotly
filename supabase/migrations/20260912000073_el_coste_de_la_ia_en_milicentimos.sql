-- El coste de la IA deja de redondear a cero.
--
-- Decisión de Bosco (12/09/2026): "cambiamos la unidad a milicéntimos".
--
-- **El problema.** `ai_usage.estimated_cost_cents` (RN-CLS-05) guarda un
-- entero de céntimos. Con `claude-haiku-4-5` —1,00 $ de entrada y 5,00 $
-- de salida por millón de tokens— una clasificación cuesta del orden de
-- 0,01 céntimos, así que la columna valía **0 en todas las llamadas** y
-- dejó de informar de nada. No era un error de cálculo: era la unidad.
--
-- **Lo que NO se hace: reescribir el libro.** `ai_usage` es un libro
-- inmutable (CLAUDE.md), así que las filas ya escritas no se tocan ni se
-- borra la columna vieja. Se añade la unidad fina, se rellena con lo que
-- había —céntimos × 1000, que es exactamente lo que aquellas filas
-- afirmaban— y desde ahora se escribe con precisión.
--
-- **Y los céntimos quedan derivados, no duplicados.** `estimated_cost_cents`
-- sigue existiendo porque es lo que ya leen los informes y porque quitarla
-- sería borrar una columna de un libro, pero deja de ser un dato que
-- alguien escribe: un CHECK obliga a que sea el redondeo de los
-- milicéntimos. Dos columnas que dicen lo mismo se separan tarde o
-- temprano; con el CHECK, separarse es imposible.
--
-- Se comprueba con `supabase/tests/hito4_solicitudes.sql`.

alter table public.ai_usage
  add column if not exists estimated_cost_millicents integer not null default 0
    check (estimated_cost_millicents >= 0);

comment on column public.ai_usage.estimated_cost_millicents is
  'RN-CLS-05 · coste estimado de la llamada en MILICÉNTIMOS de dólar
   (1 céntimo = 1000). La unidad es fina a propósito: en céntimos, una
   clasificación con Haiku redondeaba a 0 y la columna no informaba de
   nada. Lo escribe `record_classification()` con lo que calcula
   `src/services/ai-classifier.ts` a partir de los tokens.';

-- Lo ya escrito, en la unidad nueva. Las filas viejas afirmaban N
-- céntimos; en milicéntimos eso es N × 1000, ni más preciso ni menos.
update public.ai_usage
   set estimated_cost_millicents = estimated_cost_cents * 1000
 where estimated_cost_millicents = 0
   and estimated_cost_cents > 0;

comment on column public.ai_usage.estimated_cost_cents is
  'Céntimos enteros, DERIVADO de `estimated_cost_millicents` desde el
   12/09/2026 y sostenido por un CHECK: no es un segundo dato, es el mismo
   redondeado. Se conserva porque el libro es inmutable y porque hay
   lecturas que la usan.';

alter table public.ai_usage
  add constraint ai_usage_cost_units_agree
  check (estimated_cost_cents = round(estimated_cost_millicents / 1000.0));

-- ------------------------------------------------------------
-- La puerta que escribe
-- ------------------------------------------------------------
--
-- Se BORRA y se vuelve a crear en vez de `create or replace` porque el
-- décimo parámetro cambia de nombre, y PostgreSQL no deja renombrar un
-- parámetro sobre la marcha. Borrarla es además lo correcto: dejar las dos
-- versiones convivir sería dejar abierta una puerta que sigue escribiendo
-- en la unidad vieja, y el CHECK de arriba la haría fallar en la cara del
-- primero que la usara.
drop function if exists public.record_classification(
  uuid, uuid, text, text, text, text[], text, integer, integer, integer, text
);

create function public.record_classification(
  p_request_id uuid,
  p_actor_id uuid,
  p_source text,
  p_category text,
  p_summary text,
  p_matched_keywords text[] default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_millicents integer default null,
  p_fallback_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_classification_id uuid;
  v_millicents integer := coalesce(p_estimated_cost_millicents, 0);
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state = 'pending_internal_validation' then
    -- Idempotente: ya se registró un análisis para esta solicitud, se
    -- devuelve el último en vez de duplicarlo.
    select id into v_classification_id from public.classifications
    where request_id = p_request_id order by created_at desc limit 1;
    return v_classification_id;
  end if;

  if v_state <> 'analyzing' then
    raise exception 'La solicitud no está en análisis';
  end if;

  -- El cliente que envió, o quien del equipo esté reintentando. En los dos
  -- casos el actor queda en la auditoría, que es lo que importa: el
  -- registro tiene que decir quién lo hizo de verdad.
  if not (
    public.can_write_establishment_as(v_establishment_id, p_actor_id)
    or public.has_capability_as(v_space_id, p_actor_id, 'manage_requests')
  ) then
    raise exception 'El actor indicado no puede analizar esta solicitud';
  end if;

  insert into public.classifications
    (request_id, space_id, source, proposed_category, proposed_summary, matched_keywords, model, input_tokens, output_tokens, fallback_reason)
  values
    (p_request_id, v_space_id, p_source, p_category, p_summary, p_matched_keywords, p_model, p_input_tokens, p_output_tokens, p_fallback_reason)
  returning id into v_classification_id;

  if p_source = 'ai' then
    insert into public.ai_usage (
      space_id, request_id, classification_id, model, input_tokens, output_tokens,
      estimated_cost_millicents, estimated_cost_cents
    )
    values (
      v_space_id, p_request_id, v_classification_id, p_model,
      coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
      v_millicents, round(v_millicents / 1000.0)
    );
  end if;

  update public.requests set state = 'pending_internal_validation' where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, p_actor_id, 'request.classified', 'request', p_request_id,
    jsonb_build_object('state', 'analyzing'),
    jsonb_build_object('state', 'pending_internal_validation', 'source', p_source, 'category', p_category)
  );

  return v_classification_id;
end;
$$;

comment on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text) is
  'RN-CLS-04 y RN-CLS-05 · graba lo que propuso la IA y su consumo. El
   coste llega en MILICÉNTIMOS desde el 12/09/2026; los céntimos se
   derivan aquí, en el único sitio que escribe la fila.';

-- Reservada a `service_role` (migración 20260830000018): RN-CLS-01 dice
-- que la clave nunca se expone al cliente y RN-CLS-04 que se guarda qué
-- propuso de verdad la IA, y eso no puede depender de lo que afirme el
-- navegador. Al borrarla y recrearla, los privilegios vuelven a los de por
-- defecto de un proyecto de Supabase —`anon` y `authenticated` incluidos—,
-- así que esta línea NO es decorativa: sin ella, la función que graba lo
-- que dijo la IA queda abierta por RPC a cualquiera.
revoke all on function public.record_classification(uuid, uuid, text, text, text, text[], text, integer, integer, integer, text)
  from public, anon, authenticated;
