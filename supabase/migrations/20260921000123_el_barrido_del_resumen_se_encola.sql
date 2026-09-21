-- ============================================================
-- RN-NOT-06 · El barrido del resumen, encolado de verdad
-- ============================================================
--
-- La migración 122 enseñó a `run_scheduled_job()` a ejecutar
-- `notification_digests` y lo añadió al CHECK de `scheduled_jobs.kind`.
-- Faltaba la mitad que hace que ocurra: **`enqueue_due_scheduled_jobs()`
-- no lo encolaba**, así que el barrido existía y no corría nunca.
--
-- No es casualidad que se escapara. El comentario que ya está dentro de
-- esa función lo avisa desde la migración 95:
--
--     "esta función se reescribe entera cada vez que crece la lista, así
--      que copiar una versión vieja pierde en silencio lo que añadió la
--      anterior"
--
-- El aviso apuntaba a copiar una versión vieja; el fallo fue no tocarla.
-- Lo que lo caza a partir de ahora no es leer con más cuidado: es la
-- comprobación que la suite 67 hace desde hoy, que encola de verdad y
-- exige encontrar el trabajo.
--
-- Se reescribe entera, con la lista completa, por lo que dice su propio
-- comentario.

create or replace function public.enqueue_due_scheduled_jobs(
  p_run_after timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space record;
  v_kind text;
  v_hora text := to_char(p_run_after at time zone 'UTC', 'YYYYMMDDHH24');
  v_encolados integer := 0;
begin
  for v_space in select id, cuotly_plan from public.spaces loop
    foreach v_kind in array array[
      'monthly_charges',      -- RN-FIN-01
      'dunning_sweep',        -- RN-FIN-10 y RN-FIN-11
      'lifecycle_sweep',      -- RN-EST-09, RN-EST-10 y §6.4
      'consumption_sweep',    -- §18, avisos al 80 % y al 100 %
      'daily_menu_sweep',     -- RN-MEN-08 y §62
      'backup_sweep',         -- RN-BCK-02, una copia al día
      'charge_reminders',     -- RN-REC-02, el aviso del vencimiento
      -- RN-NOT-06 (migración 122) · el resumen diario. Se encola cada hora
      -- como todos los demás: la que decide si toca es la función del
      -- barrido, que mira si en ESE espacio son las ocho. Aquí no se sabe
      -- la zona de nadie, y preguntarla por espacio para ahorrarse una
      -- fila de cola sería poner la misma regla en dos sitios.
      'notification_digests'
    ]
    loop
      if public.enqueue_scheduled_job(
           v_space.id, v_kind, p_run_after,
           v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
        v_encolados := v_encolados + 1;
      end if;
    end loop;

    -- Los dos de plataforma, solo para los espacios con suscripción de
    -- Cuotly: el cobro (Hito 18) y el almacenamiento (RN-SUB-13, migración
    -- 95). Los dos van en el mismo bucle desde la 95 y siguen aquí — esta
    -- función se reescribe entera cada vez que crece la lista, así que
    -- copiar una versión vieja pierde en silencio lo que añadió la anterior.
    if v_space.cuotly_plan is not null then
      foreach v_kind in array array['cuotly_billing_sweep', 'cuotly_storage_sweep'] loop
        if public.enqueue_scheduled_job(
             v_space.id, v_kind, p_run_after,
             v_kind || ':' || v_space.id::text || ':' || v_hora) is not null then
          v_encolados := v_encolados + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_encolados;
end;
$$;

revoke all on function public.enqueue_due_scheduled_jobs(timestamptz)
  from public, anon, authenticated;
