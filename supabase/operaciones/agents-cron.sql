-- Tareas programadas de Restavor agents (PRD de agents §10.6).
--
-- Las migraciones NO programan tareas: el arranque local sin Docker no tiene `pg_cron`,
-- `pg_net`, Realtime ni Storage, y cada entorno tiene su dirección. Este script se ejecuta UNA
-- vez por entorno (Restavor pruebas, producción), a mano, con la dirección de la aplicación y el
-- secreto de las tareas. Es idempotente: repetirlo actualiza los valores y no duplica las tareas.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v base_url="https://app.restavor.com" -v cron_secret="<el CRON_SECRET del entorno>" \
--     -f supabase/operaciones/agents-cron.sql
--
-- En Restavor pruebas la dirección es la de vista previa de la rama `agents`; en producción, la
-- de producción, y nunca al revés (docs/agents/PRUEBAS.md). El secreto es el `CRON_SECRET` que ya
-- usa `/api/cola`: las rutas `/api/agents/cron/<tarea>` aceptan el mismo `Authorization: Bearer`.
--
-- Fase C · una sola tarea: cada 15 minutos, `/api/agents/cron/pendientes` recuerda los grupos
-- pendientes con más de 2 horas (RN-RES-05). Las demás tareas de §10.6 (reintentos de avisos,
-- encender el agente, barrido del ciclo de vida, anonimizar…) se añaden aquí cuando se construyan
-- sus fases, cada una con su ruta.
--
-- Necesita las extensiones `pg_cron`, `pg_net` y `vault` de Supabase (Database → Extensions).
-- En local no existen: ahí la tarea se lanza llamando a la ruta o a la función directamente.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- La dirección y el secreto, en Vault (nunca en el texto de la tarea). `psql` no sustituye
-- `:'variable'` dentro de un bloque `do $$`, así que se pasan por la configuración de la sesión.
select set_config('agents_cron.base_url', :'base_url', false) as a, set_config('agents_cron.secret', :'cron_secret', false) as b \gset _
do $$
declare
  v_id uuid;
  v_base text := current_setting('agents_cron.base_url');
  v_secret text := current_setting('agents_cron.secret');
begin
  select id into v_id from vault.secrets where name = 'agents_cron_base_url';
  if v_id is null then
    perform vault.create_secret(v_base, 'agents_cron_base_url', 'Dirección de la aplicación para las tareas de Restavor agents');
  else
    perform vault.update_secret(v_id, v_base);
  end if;

  select id into v_id from vault.secrets where name = 'agents_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'agents_cron_secret', 'CRON_SECRET de las rutas /api/agents/cron');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end $$;

-- Cada 15 minutos: grupos pendientes con más de 2 horas → un aviso más.
select cron.unschedule(jobid) from cron.job where jobname = 'agents-pendientes';
select cron.schedule(
  'agents-pendientes',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'agents_cron_base_url') || '/api/agents/cron/pendientes',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agents_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
