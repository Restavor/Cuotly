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

## Estado de la Fase A (01/10/2026): qué probar a mano

Todo en la vista previa de la rama `agents` (Vercel → Deployments → el de la rama `agents`; su dirección lleva `-git-agents-`). Los pasos:

1. Entra con `restaurante@cuotly.test` (contraseña de demostración). Debes ver **«Hola…»**, la tarjeta de **Restavor web** y la de **Restavor agents**
   «Sin contratar» con el botón **Contratar Reservas**.
2. Pulsa **Contratar Reservas**: se abre una ventana con el restaurante, lo que incluye, 48 € + IVA al mes, los tres pasos y la casilla de las
   condiciones (su texto es provisional). El botón «Enviar solicitud» no se activa hasta marcar la casilla. Envíala: la tarjeta pasa a
   **«Solicitud enviada»** con los cuatro pasos.
3. Pulsa el logo (arriba a la izquierda) estando en Restavor web: sale el menú **Inicio de Restavor / Restavor web / Restavor agents** (este último con
   «Contratar» si aún no lo tienes).
4. Entra con `owner@cuotly.test` (espacio `demo`): como solo tiene Restavor web, **entra directo en `/web`** (no ve la puerta). Con `info@restavor.com`
   entras **siempre al Inicio** (`/`), nunca se te salta (decisión 101). En el menú del espacio hay una entrada nueva **Reservas**: ahí está la solicitud del paso 2 como «Pendiente de revisar» y el
   formulario «Crear solicitud para este restaurante». Aprobar y rechazar todavía no existen (la pantalla lo dice).
5. En `/signup` hay una casilla nueva **«¿Qué te interesa?»** (Mantenimiento web / Reservas / Las dos). Lo que marque quien pide acceso lo ve
   quien aprueba en `/administracion/accesos`.
6. En la pantalla de entrar, el botón dice **«Entrar en Restavor»**.
7. Los avisos: el correo de la solicitud sale en la próxima tanda (07:00 y 19:00 UTC; en Pruebas no hay clave de correo, así que no sale); el
   push sale al momento a quien tenga la app móvil instalada.

## Estado de la Fase B (02/10/2026): qué probar a mano

Los cimientos de Restavor agents: la base de datos de Reservas, los permisos, el armazón y el sembrado. Todavía **no hay agenda**: cada pantalla
existe, está protegida y dice en qué fase se construye; ninguna enseña datos de relleno. Todo en la vista previa de la rama `agents`, con las cuentas
de la tabla de abajo (misma contraseña de demostración):

1. **Varios restaurantes → selector.** Entra con `jose@casapepe.test` (Propietario de Casa Pepe y Encargado de Casa Pepe Centro). En el Inicio ves
   Restavor web (Casa Pepe tiene plan de mantenimiento) y Restavor agents. Entra en agents: sale **«Elige un restaurante»** con los dos. Pulsa
   «Entrar» en Casa Pepe: aterrizas en **Hoy**.
2. **El menú.** En Casa Pepe, a la izquierda, la ficha del restaurante, «Volver al inicio de Restavor» y la sección **Reservas**: Hoy · Calendario ·
   Agente de llamadas · Ajustes; abajo **Saldo (7,40 €)** · Plan y pagos · Ayuda. Cada pantalla dice «Esta pantalla llega en una fase posterior» con la
   fase que la construye (C la agenda, D equipo y tablet, E cobro y saldo, G el agente, I plataformas). Eso es lo esperado.
3. **Móvil** (390 px): la barra inferior es **Hoy · Calendario · (+) Nueva · Agente · Más**; «Más» lleva a una lista de verdad con Saldo, Plan, Ayuda y
   los ajustes.
4. **Cada papel ve lo suyo.** `luis@casapepe.test` (Encargado): el menú no lleva **Plan y pagos**, y si pegas `/agents/e5200000-0000-0000-0000-000000000001/plan`
   te dice que no tienes permiso. `carla@barlaplaza.test`: ve Bar La Plaza (saldo 1,80 €); si pegas la dirección de Casa Pepe no te deja entrar.
   `rosa@tabernasol.test`: solo tiene Reservas, así que entra directo (sin Restavor web, sin selector), con saldo 0,00 €.
5. **Los seis estados.** `estados@casapepe.test` es Propietario de siete restaurantes de prueba. En el selector: **Bodega Norte** (aprobada, sin pagar)
   lleva a «Aprobado: datos para pagar» y no enseña la agenda; **Casa Mar** (cerrada) lleva a «Reservas cerrada» y su menú queda vacío; **Cervecería
   Roma** (en pausa) enseña todo menos el botón (+) Nueva; **Mesón del Puerto** (cobro vencido) y **Asador Vega** (en baja) entran a Hoy. **Taberna Levante**
   (solicitud pendiente) y **Café Rechazado** (rechazada) salen en el Inicio de Restavor app como solicitudes.
6. **Gestionar Reservas.** Como `jose@casapepe.test`, en el panel de Casa Pepe → «Usuarios y accesos»: cada Editor tiene la casilla **«Gestionar Reservas»**
   (Luis la tiene marcada). Se guarda y se lee. También en el formulario de invitar.
7. **Soporte de Reservas.** Como propietario del espacio (`info@restavor.com` en Pruebas), en Equipo → Permisos de una persona sale la tarjeta
   **«Restavor agents»** con el interruptor **«Soporte de Reservas»** (marcado en Elena y en `info@`; `admin@cuotly.test` es un administrador sin marcar). Solo el
   propietario puede cambiarlo.
8. **Las piezas.** `/styleguide` (al final) enseña el chip de origen (Agente, TheFork, CoverManager, Web, Manual), Pendiente / Posible duplicada / No vino / Nueva, la fila
   de reserva en sus cinco formas, la barra de aforo (verde, «Casi lleno», «Aforo superado»), la tarjeta del agente y el teclado de PIN. `/armazon/agents?actor=device`
   enseña el menú de la tablet sin PIN (sin Ajustes, Saldo ni Plan).

Lo que **no** está y es de fases posteriores: la agenda (C), el PIN real, la tablet y la sesión de soporte (D), aprobar solicitudes, cobros y recargas (E), los
avisos a comensales (F), el agente de llamadas (G), el formulario web (H) y los conectores (I). El sembrado no registra ningún segundo paso (decisión 106).

**El PIN del Equipo de Casa Pepe** (Ana Ruiz 1234, Diego Navas 5678) se guarda cifrado con el secreto `restavor-pruebas-pin-secret`. Para que sirvan en la Fase D,
`AGENTS_PIN_SECRET` de la vista previa de la rama `agents` tiene que valer eso. Hasta entonces no abren nada.

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

Las de Reservas (`supabase/seed/reservas-demo.sql`, Fase B), todas con la misma contraseña:

| Correo | Quién es |
|---|---|
| `jose@casapepe.test` | José García. Propietario de **Casa Pepe** (Sevilla; plan de mantenimiento y Reservas activa; saldo 7,40 €) y Encargado de **Casa Pepe Centro** |
| `maria@casapepe.test` | María García. Propietaria de Casa Pepe |
| `luis@casapepe.test` | Luis Martín. Encargado de Casa Pepe (Editor con «Gestionar Reservas») |
| `rosa@tabernasol.test` | Rosa Prieto. Propietaria de **Taberna Sol** (solo Reservas, sin saldo; dos tandas de cena) |
| `carla@barlaplaza.test` | Carla Sanz. Propietaria de **Bar La Plaza** (otro grupo, saldo 1,80 €), para el aislamiento |
| `estados@casapepe.test` | Propietario de los siete restaurantes de prueba: Bodega Norte (aprobada, sin pagar), Mesón del Puerto (cobro vencido), Cervecería Roma (en pausa), Asador Vega (en baja), Casa Mar (cerrada), Taberna Levante (solicitud pendiente) y Café Rechazado (solicitud rechazada) |
| `admin@cuotly.test` | Administrador del espacio **sin** la marca de soporte de Reservas: no ve a los comensales |

Equipo de Casa Pepe sin cuenta: Ana Ruiz (PIN 1234) y Diego Navas (PIN 5678). Marca «Soporte de Reservas»: Elena e `info@restavor.com`.
El sábado 26/09/2026 de Casa Pepe tiene las 12 reservas de la maqueta, y se copian al próximo día abierto desde hoy para mirarlas a mano.

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

**Restavor agents** (Fase B): sus tablas y pantallas existen, y los restaurantes de prueba de Reservas están en el espacio `demo`, con las cuentas de arriba. El
espacio `restavor` no tiene ningún restaurante con Reservas (es el de la empresa): sus pantallas de Reservas son las del equipo, que llegan en la Fase E.

El catálogo de planes **del espacio demo** es el antiguo, salvo Café Prueba, que desde el 01/10/2026 está en Impulso en créditos (20 al mes) porque el
recorrido largo de las pruebas necesita un plan con créditos (decisión 85). El resto sigue en el catálogo antiguo: PRD §16 dice que el sembrado de Reservas
no depende de ellos, y Casa Pepe usa el mismo Impulso en créditos que Café Prueba.

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
