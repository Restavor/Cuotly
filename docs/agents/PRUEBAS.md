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
- Pendiente: las variables de la vista previa en Vercel y la configuración de Auth de Supabase (Site URL y Redirect URLs).
  Hasta que se hagan, **no abras ninguna vista previa de Vercel de la rama `agents`**: hoy las variables de Preview de `cuotly-web`
  (Supabase, clave de servicio, Resend, Anthropic) llevan valores de **producción**.

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
El espacio `restavor` (catálogo Básico, Impulso, Premium) sí sale de las migraciones.

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
- **CI:** al 30/09/2026, el CI del repositorio falla en tres trabajos ya antes de la Fase 0. Ver el hito de la Fase 0 en `docs/ROADMAP.md`.
