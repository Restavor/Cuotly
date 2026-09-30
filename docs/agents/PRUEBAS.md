# Entorno de pruebas de Restavor app y Restavor agents

Es una copia de Restavor web con datos inventados, para construir y probar la ampliación (`docs/agents/`) sin tocar producción.
Nada de lo que hay aquí existe en producción, y nada de producción se lee ni se escribe desde aquí.

| Qué | Producción | Pruebas |
|---|---|---|
| Rama de GitHub | `claude/cuotly-supabase-migrations-tests-q8o18p` (cada subida se publica) | **`agents`** |
| Base de datos (Supabase) | `Cuotly` · `mcajbfxhkxtdhjoyrqha` · eu-west-1 | **`Restavor pruebas`** · `bnucqykimngjwcrlpmsm` · eu-west-1 (Irlanda) |
| Web (Vercel) | `app.restavor.com` | Vista previa de la rama `agents` (dirección pendiente, ver abajo) |
| Correo (Resend) | clave real | **ninguna**: los avisos se quedan en cola y no salen |
| IA (Anthropic) | clave real | **ninguna**: clasifica el motor de reglas (RN-CLS-02) |

## Estado de la Fase 0 (30/09/2026)

- Hecho: la base `Restavor pruebas` tiene las **155 migraciones**, **119 tablas con RLS activado** y el espacio de demostración sembrado
  (7 cuentas, 4 restaurantes).
- Hecho (30/09/2026): variables de Vercel. Las seis que valían para Production y Preview (URL y claves de Supabase, Anthropic, Resend) valen
  ahora **solo para Production**. Para la rama `agents` (Preview) hay tres propias: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (las de `Restavor pruebas`) y `NEXT_PUBLIC_SITE_URL`. Pruebas no lleva clave de Resend ni de Anthropic.
  Consecuencia: las vistas previas de **otras** ramas se quedan sin variables de Supabase y no funcionan. Es lo previsto.
- Pendiente, de Bosco:
  1. Pegar en Vercel (cuotly-web → Settings → Environment Variables) `SUPABASE_SERVICE_ROLE_KEY` de `Restavor pruebas`: Environment = Preview,
     rama `agents`, tipo Sensitive. La clave está en Supabase → Project Settings → API Keys (`service_role`). Sin ella la vista previa abre,
     pero todo lo que usa el servidor con esa clave falla.
  2. Confirmar la dirección de la vista previa (Vercel → Deployments → el de la rama `agents`). Se ha puesto en `NEXT_PUBLIC_SITE_URL`
     `https://cuotly-web-git-agents-info-67216310.vercel.app` por el patrón de los alias; si es otra, se cambia.
  3. Supabase de `Restavor pruebas` → Authentication → URL Configuration: *Site URL* con esa dirección y, en *Redirect URLs*, esa dirección
     seguida de `/**`.
  Hasta que esto esté, sigue sin poder comprobarse el acceso a la vista previa.

## Cuentas del sembrado

Todas con la contraseña `Restavor-demo-2026` (solo en pruebas, nunca en producción).

| Correo | Quién es |
|---|---|
| `owner@cuotly.test` | Propietaria del espacio de demostración (equipo) |
| `trabajadora@cuotly.test`, `trabajador2@cuotly.test` | Trabajadores del espacio |
| `restaurante@cuotly.test` | Propietario de "Bar Demo" |
| `cliente2@cuotly.test` | Propietario de "Café Prueba" |
| `magarinos@cuotly.test` | Propietaria de "Magariños" |
| `sala.magarinos@cuotly.test` | Editor sin permisos en "Magariños" (solo lee) |

`info@restavor.com` (Bosco, propietario de la plataforma) **no existe** en Pruebas: es otra base de cuentas. Para entrar en `/administracion`
hay que registrarse allí con ese correo (los correos de registro solo salen si se configura Resend; hasta entonces, crear la cuenta desde el
panel de Supabase de Restavor pruebas → Authentication → Users) y volver a ejecutar el sembrado.

El catálogo de planes **del espacio demo** es el antiguo: el sembrado está desfasado respecto a los créditos (PRD §16 lo resuelve en la Fase B).
**En Pruebas no existe el espacio `restavor`** (el de Bosco, con el catálogo Básico, Impulso y Premium): las migraciones traen la función
`create_restavor_space()`, pero alguien tiene que llamarla, y en producción se hizo a mano. Solo hay el espacio `demo`. Hay que crearlo antes de la
Fase A (las pantallas del lado de Restavor, `spaces.reservations_enabled` y las solicitudes de Reservas viven en ese espacio).

## Cómo se cargan las migraciones y el sembrado

Lo hace el proceso de GitHub `Pruebas · Supabase` (`.github/workflows/pruebas-supabase.yml`). No hay que hacer nada a mano:

1. Se sube a la rama `agents` una migración nueva en `supabase/migrations/`. El proceso aplica las que falten, en orden.
2. Si en esa subida cambia algo de `supabase/seed/`, también rehace el sembrado (borra y reconstruye el espacio de demostración).
   También se puede lanzar a mano desde la pestaña Actions con "sembrar".
3. Al final imprime solo cifras: migraciones aplicadas, tablas y tablas sin RLS (tiene que ser 0).

Está pensado para no poder tocar producción:

- Solo corre en la rama `agents`.
- La dirección de la base va en el secreto de GitHub `PRUEBAS_DATABASE_URL` (Settings → Secrets and variables → Actions → Repository secrets).
  Es la dirección **Session pooler** de `Restavor pruebas` (Supabase → Connect). Los servidores de GitHub no llegan a la dirección directa.
- El proceso aborta si la dirección contiene el identificador de producción o si no contiene el de `Restavor pruebas`.
- La contraseña puede llevar `@`: `.github/scripts/conexion-pruebas.sh` parte la dirección por la última.

Si el secreto falta, el proceso se salta sin dar error. Si la base se ha pausado (ver abajo), falla al conectar.

## Cosas a tener presentes

- **Pausa a los 7 días:** un proyecto gratuito de Supabase se pausa solo tras una semana con poca actividad. Se reanuda desde el panel
  (Resume project) en los 90 días siguientes, con sus datos.
- **Reglas de seguridad:** nunca se aplica una migración al proyecto `Cuotly` ni se sube a la rama de producción sin que Bosco lo pida por escrito
  en ese momento. Las migraciones de cada fase se aplican solo a `Restavor pruebas`.
- **Correo y direcciones `.test`:** el sembrado usa direcciones `@cuotly.test` que no existen. Pruebas no lleva clave de Resend para no generar
  rebotes duros. Cuando una fase necesite correo real (Fase F), se usa una clave propia de pruebas y direcciones reales.
- **Protección de las vistas previas:** Vercel pide iniciar sesión para abrir una vista previa. Stripe, `pg_cron` y las llamadas externas al agente no
  podrán entrar sin una excepción (Fases E y G). Se decide entonces.
- **CI:** no hay ninguna ejecución verde desde el 17/09/2026 (la #220). Causas y arreglos propuestos en el hito de la Fase 0 de `docs/ROADMAP.md`.
