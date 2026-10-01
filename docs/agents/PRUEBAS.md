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
| `owner@cuotly.test` | Elena. En el código y en el CI es la propietaria del espacio demo; en Pruebas pasa a Administradora, porque el propietario es `info@restavor.com` |
| `trabajadora@cuotly.test`, `trabajador2@cuotly.test` | Trabajadores del espacio |
| `restaurante@cuotly.test` | Propietario de "Bar Demo" |
| `cliente2@cuotly.test` | Propietario de "Café Prueba" |
| `magarinos@cuotly.test` | Propietaria de "Magariños" |
| `sala.magarinos@cuotly.test` | Editor sin permisos en "Magariños" (solo lee) |

## Propietario: `info@restavor.com` (01/10/2026)

`info@restavor.com` es el **único propietario** en Pruebas, como en producción:

- **Propietario de la plataforma** (`is_platform_owner()`, por el correo). Para entrar en `/administracion` hace falta además la verificación
  en dos pasos en esa cuenta (RN-ADM-02); sin ella es un usuario normal, y para ver el espacio demo no hace falta.
- **Espacio `restavor`** (el de la empresa, con el catálogo Básico, Impulso y Premium): creado en Pruebas el 01/10/2026 con esa cuenta como única
  propietaria, llamando una vez a `create_restavor_space()`. El sembrado **no** lo toca, así que se conserva al resembrar; si alguna vez se rehace la
  base entera, hay que repetirlo.
- **Espacio `demo`**: el sembrado (sección 13 de `supabase/seed/espacio-demo.sql`) le da la propiedad con `transfer_space_ownership()` y deja a Elena
  (`owner@cuotly.test`) como Administradora. Va al final del sembrado, porque las secciones anteriores necesitan a Elena como propietaria para
  construir los flujos, y se repite en cada resembrado. Si la cuenta `info@` no existe (el CI, una base local), no hace nada y Elena sigue siendo la
  propietaria, que es lo que esperan las pruebas automáticas. Por eso `owner@cuotly.test` no se puede quitar del código.

La cuenta se creó a mano en Supabase (Authentication → Users) con una contraseña de Bosco, no con la de demostración: esa contraseña está en el
repositorio y la del administrador no puede estarlo.

**Restavor agents** todavía no tiene nada que poseer: sus tablas y pantallas llegan en la Fase B. Cuando existan, su propietario será esta misma cuenta.

El catálogo de planes **del espacio demo** es el antiguo, salvo Café Prueba, que desde el 01/10/2026 está en Impulso en créditos (20 al mes) porque el
recorrido largo de las pruebas necesita un plan con créditos (decisión 85). PRD §16 pone al día el resto en la Fase B.

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
- **CI:** en verde desde el 01/10/2026 (ejecución #420), después de estar roto del 17/09 al 01/10. Causas y arreglos en el hito de la Fase 0 de `docs/ROADMAP.md`.
