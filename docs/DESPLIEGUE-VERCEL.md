# Desplegar Cuotly en Vercel

Este archivo dice **qué hay que configurar en Vercel** para que Cuotly
funcione sola: la aplicación web y, sobre todo, el cron que dispara la cola.

Escrito el 02/09/2026 como preparación. **Desplegado de verdad el
20/09/2026**, y desde entonces esto es también el registro de lo que hay.

## Lo que hay hoy en Vercel (20/09/2026)

Dos proyectos, los dos conectados a `Restavor/Cuotly` y los dos sirviendo la
rama `claude/cuotly-supabase-migrations-tests-q8o18p`:

| Proyecto | Qué sirve | Raíz | Dirección |
|---|---|---|---|
| `cuotly-web` | La aplicación web (Next.js) | `apps/web` | `cuotly-web.vercel.app` |
| `cuotly-movil` | La app móvil exportada para navegador | `apps/mobile` | `cuotly-movil.vercel.app` |

**Un aviso que costó doce días de confusión.** Hasta el 20/09/2026, la
producción de `cuotly-web` seguía sirviendo el despliegue del **8 de
septiembre**. Todo lo construido entre el 8 y el 20 —el diseño definitivo de
escritorio, el de móvil, los informes, Premium+, las invitaciones al panel—
estaba en el repositorio y **no estaba en la dirección que se miraba**. Mirar
`cuotly-web.vercel.app` y concluir "esto no se parece al diseño" era mirar un
edificio de hace dos semanas. Antes de juzgar una pantalla, comprueba de qué
commit viene el despliegue.

### El móvil en el navegador

`apps/mobile` es Expo. Lo que se despliega en Vercel es su exportación para
web (`expo export --platform web`), que es el mismo código corriendo sobre
`react-native-web`: sirve para **mirar el diseño desde un teléfono sin
compilar un binario**, no sustituye a la app nativa. Deja un solo
`index.html`, así que `apps/mobile/vercel.json` reescribe todas las
direcciones a él; sin eso, recargar en `/login` daría 404.

Sus variables llevan el prefijo `EXPO_PUBLIC_` y **se incrustan al compilar**:
cambiarlas en Vercel no basta, hay que volver a desplegar.

| Variable | Si falta |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | La app no arranca: pantalla en blanco |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Igual |
| `EXPO_PUBLIC_WEB_URL` | No se pueden subir archivos; la pantalla lo dice |

## Revisión del 21/09/2026 · lo comprobado y lo que falta

Comprobado **por la API de Vercel** desde la sesión (el contenedor tiene
bloqueado `*.vercel.app` por política de red, así que abrir las páginas y
mirar los registros de compilación sigue siendo cosa del navegador):

- **El plan es Hobby.** Eso confirma el primero de los tres detalles que
  estaban escritos de memoria: el cron **no puede correr cada hora**.
  `apps/web/vercel.json` declara dos pasadas al día (07:00 y 19:00 UTC) y
  eso es lo que el plan admite. De ahí salió el fallo del resumen diario
  que corrigió la migración 124.
- **Los despliegues sí se disparan al subir, y el de hoy está verde.** El
  despliegue de producción de `cuotly-web` se compiló el 21/09/2026 a las
  17:45 UTC desde el commit `0c65ae6` de la rama de trabajo y terminó en
  `Deployment completed`. Cuidado al leer la API: el alias lleva una fecha
  `created` del 03/09 que es la del **alias**, no la del despliegue; la del
  despliegue está en su registro de compilación.
- **`cuotly-web` tiene ocho variables**: `CRON_SECRET`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `RESEND_API_KEY` y `RESEND_FROM`.

### Lo que falta, y qué deja sin funcionar

| Proyecto | Variable que falta | Consecuencia hoy en producción |
|---|---|---|
| `cuotly-web` | `INTEGRATIONS_VAULT_KEY` | **Ninguna fuente analítica se puede conectar** (RN-INT-02). La pantalla lo dice en vez de fallar. |
| `cuotly-web` | `GOOGLE_OAUTH_CLIENT_ID` y `..._SECRET` | GA4, Search Console y Perfil de Empresa no se pueden conectar. Clarity y PageSpeed sí. |
| ~~`cuotly-movil` · `EXPO_PUBLIC_SUPABASE_URL`~~ | ~~La app en el navegador no arranca: pantalla en blanco.~~ | **Puesta el 21/09/2026** |
| ~~`cuotly-movil` · `EXPO_PUBLIC_SUPABASE_ANON_KEY`~~ | ~~Igual.~~ | **Puesta el 21/09/2026** |

Las dos del móvil eran los mismos valores públicos que ya usa la web
—viajan dentro del paquete JS, no son secretos— y se pusieron el
21/09/2026 con un redespliegue detrás, porque `EXPO_PUBLIC_*` se incrusta
al compilar y la variable sola no hace nada. Antes de copiarla se comprobó
que el token llevara `"role":"anon"` y no el de servicio; conviene repetir
esa comprobación cada vez que se mueva una clave de Supabase de un sitio a
otro, porque las dos se parecen mucho.

Las otras dos sí son secretos que alguien tiene que generar u obtener, y
tienen su receta más abajo.

### Lo que sigue sin poder comprobarse desde aquí

- **Que el móvil haya dejado de estar en blanco.** Las dos variables están
  puestas y el redespliegue del 21/09/2026 a las 18:27 UTC terminó bien
  —Vercel solo repunta el alias de producción cuando la compilación sale
  verde—, pero eso prueba que *compiló*, no que la pantalla pinte. Hay que
  abrir `cuotly-movil.vercel.app` y mirarlo.
- El `maxDuration` de la función de la cola y **que la invocación del cron
  llegue de verdad** — los otros dos detalles escritos de memoria.
- El primer envío real de correo con Resend, con su dominio verificado.

### Cómo poner la clave de la caja fuerte (`INTEGRATIONS_VAULT_KEY`)

Es la clave con la que Cuotly cifra las credenciales de las integraciones
—los tokens de Google, las claves de Clarity y PageSpeed— **antes** de
guardarlas en Supabase (RN-INT-02). La base guarda el resultado cifrado; la
clave vive solo en el entorno de Vercel. Por eso nadie con acceso a la base
de datos, Supabase incluido, puede leer esas credenciales.

1. **Genérala en tu ordenador**, en una terminal:

   ```bash
   openssl rand -base64 32
   ```

   Salen 44 caracteres terminados en `=`. Tienen que ser **32 bytes en
   base64**: si pones otra cosa, la aplicación lo dice al arrancar la ruta
   en vez de guardar nada en claro.

2. **Pégala en Vercel**: proyecto `cuotly-web` → *Settings* →
   *Environment Variables* → *Add New*.

   - *Key*: `INTEGRATIONS_VAULT_KEY`
   - *Value*: lo que ha salido del comando
   - *Type*: **Sensitive** (así Vercel no te la vuelve a enseñar)
   - *Environments*: Production y Preview

3. **Vuelve a desplegar.** Vercel no aplica una variable nueva al
   despliegue que ya está corriendo: en *Deployments*, el de producción,
   menú `···` → *Redeploy*.

`INTEGRATIONS_VAULT_KEY_VERSION` **no hace falta ponerla**: sin ella vale
`1`, que es lo correcto para la primera clave. Solo entra en juego el día
que quieras rotarla, y ese día se pone la nueva en `INTEGRATIONS_VAULT_KEY`,
la vieja en `INTEGRATIONS_VAULT_KEY_PREVIOUS` y la versión en `2`.

**Lo que no hay que hacer:** cambiar esta clave sin dejar la anterior en
`_PREVIOUS`. Lo cifrado con la vieja deja de poder leerse, y cada
establecimiento tiene que volver a autorizar todas sus fuentes a mano. No
hay forma de recuperarlo: ese es justamente el punto de cifrarlo así.

### Cómo crear el cliente OAuth de Google

Es lo que permite que un restaurante conecte **GA4, Search Console y el
Perfil de Empresa**. Clarity y PageSpeed no lo necesitan: esas van con su
propia clave y funcionan sin esto.

1. Entra en <https://console.cloud.google.com/> con la cuenta de Google que
   vaya a ser la dueña, y crea un proyecto (o usa uno que ya tengas).

2. **Activa las APIs** que Cuotly va a llamar, en *APIs y servicios* →
   *Biblioteca*. Son tres, una por fuente:

   | Fuente | API que hay que activar |
   |---|---|
   | GA4 | Google Analytics Data API |
   | Search Console | Google Search Console API |
   | Perfil de Empresa | Business Profile Performance API |

   Si solo vas a usar una, activa solo esa: lo demás se puede añadir
   después sin tocar el cliente OAuth.

3. **Rellena la pantalla de consentimiento** (*OAuth consent screen*). Tipo
   **External**, nombre de la aplicación, correo de contacto y dominio.
   Es lo que verá el restaurante cuando le pidas permiso, así que el nombre
   importa.

4. **Crea las credenciales**: *Credenciales* → *Crear credenciales* →
   *ID de cliente de OAuth* → tipo **Aplicación web**.

5. **El URI de redirección autorizado.** Esta es la parte donde falla todo
   el mundo, porque Google compara la cadena **carácter a carácter**. Es tu
   `NEXT_PUBLIC_SITE_URL` seguido de la ruta del callback:

   ```
   https://cuotly-web.vercel.app/api/integraciones/oauth/callback
   ```

   Sin barra al final. Si `NEXT_PUBLIC_SITE_URL` en Vercel es otra cosa
   —un dominio propio, por ejemplo— tiene que ser **esa**, no la de arriba:
   la aplicación construye el URI a partir de esa variable, así que si no
   coinciden Google contesta `redirect_uri_mismatch` y no pasa nada más.
   La ruta sale de `OAUTH_CALLBACK_PATH` en
   `apps/web/src/services/google-oauth.ts`, por si algún día cambia.

6. **Copia el ID y el secreto a Vercel**, en `cuotly-web`, los dos como
   *Sensitive*, en Production y Preview:

   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`

7. **Vuelve a desplegar**, igual que antes.

**Lo que conviene saber antes de empezar con el Perfil de Empresa:** los
permisos que Cuotly pide son de solo lectura donde Google los ofrece
(`analytics.readonly`, `webmasters.readonly`), pero el Perfil de Empresa
**no tiene uno de solo lectura**: `business.manage` es el único que da
acceso a la API de rendimiento, y Google lo considera un permiso
restringido. Mientras la aplicación esté en modo de prueba solo funcionará
con las cuentas que añadas a mano como usuarios de prueba; para abrirlo a
cualquier restaurante hay que pasar la **verificación de Google**, que
lleva semanas y pide un vídeo del recorrido. GA4 y Search Console no
necesitan esa verificación, así que lo sensato es empezar por esas dos.

## Qué depende del cron

Sin cron, Cuotly funciona pero no hace nada por su cuenta. Todo esto está
implementado y esperando a que alguien lo llame:

| Qué | Regla | Función |
|---|---|---|
| Emitir la mensualidad de cada restaurante | RN-FIN-01 | `run_monthly_charges()` |
| Ciclo de impago: aviso, pausa, suspensión | RN-FIN-10, RN-FIN-11 | `run_dunning_sweep()` |
| Fin de servicio por baja y sus 24 h de solo lectura | RN-EST-09, RN-EST-10 | `run_lifecycle_sweep()` |
| Cambio de plan programado, al renovar | §6.4 | `apply_scheduled_plan_change()` |
| Avisos de consumo al 80 % y al 100 % | §18 | `run_consumption_thresholds()` |
| Umbrales de T2 y T3 | RN-SLA | `runSlaSweep()`, en `src/services/` |
| Enviar los correos encolados | RN-NOT-05 | `drainEmailQueue()` |

Los tres últimos se calculan en TypeScript y no en SQL a propósito: usan el
reloj laboral de `src/core/`, y duplicar ese cálculo en la base de datos es
justo lo que prohíbe `CLAUDE.md`.

## 1. El proyecto en Vercel

El repositorio es un monorepo con pnpm. La aplicación web es
**`apps/web`**, así que en Vercel:

- **Root Directory**: `apps/web`.
- El resto (framework Next.js, comandos de build) lo detecta solo.
- `apps/web/vercel.json` ya está en el repositorio con el cron declarado.

## 2. Variables de entorno

En Vercel → Settings → Environment Variables. Las que llevan
`NEXT_PUBLIC_` acaban en el navegador; las demás **solo** en el servidor.

| Variable | Para qué | Si falta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Conectar con Supabase | No arranca |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sesión del usuario | No arranca |
| `NEXT_PUBLIC_SITE_URL` | Enlaces absolutos de los correos | Correos con enlaces rotos |
| `SUPABASE_SERVICE_ROLE_KEY` | Clasificar y ejecutar la cola | No se clasifica ninguna solicitud; la cola falla |
| `CRON_SECRET` | Autenticar el cron | **La ruta responde 503 y el cron no hace nada** |
| `ANTHROPIC_API_KEY` | Clasificación con IA | Cae al motor de reglas (RN-CLS-02), no es un fallo |
| `RESEND_API_KEY` | Enviar los correos | Se encolan y salen cuando se configure; nunca se pierden |
| `RESEND_FROM` | Remitente | Usa `Cuotly <avisos@cuotly.com>` |
| `INTEGRATIONS_VAULT_KEY` | Cifrar las credenciales de las integraciones (RN-INT-02): 32 bytes en base64, `openssl rand -base64 32` | **No se puede conectar ninguna fuente** y la cola no reclama sincronizaciones; la pantalla lo dice |
| `INTEGRATIONS_VAULT_KEY_VERSION` | La versión de la clave actual (para rotarla) | Vale `1` |
| `INTEGRATIONS_VAULT_KEY_PREVIOUS` | La clave anterior, solo para descifrar lo guardado con ella durante una rotación | Lo cifrado con la versión anterior deja de leerse hasta volver a autorizar |
| `GOOGLE_OAUTH_CLIENT_ID` | El cliente OAuth de Google Cloud (GA4, Search Console, Business Profile) | Esas tres no se pueden conectar; Clarity y PageSpeed sí |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Su secreto | Igual que arriba |

El cliente OAuth se crea en Google Cloud (APIs y servicios › Credenciales,
tipo "aplicación web") con `https://<dominio>/api/integraciones/oauth/callback`
como URI de redirección autorizada, y con las API habilitadas: Google
Analytics Data API, Google Search Console API, Business Profile
Performance API y My Business Business Information API (esta última pide
acceso a la API de Business Profile, que Google concede por formulario).
PageSpeed Insights API se habilita en el mismo proyecto y su clave de API
la pega el propietario del espacio en la ficha del restaurante.

**La cadencia.** La cola entra dos veces al día (07:00 y 19:00 UTC), así
que las esperas de reintento de RN-INT-04 (1 h, 4 h, 16 h, 24 h) son un
mínimo: una sincronización marcada para dentro de una hora se ejecuta en
la siguiente entrada del cron. Cada tanda reclama como máximo cinco
ejecuciones de integraciones (`RUNS_PER_BATCH`) para caber en el minuto
de `maxDuration`; con más restaurantes conectados que eso, las que quedan
esperan a la siguiente tanda, que es lo que "la programa el sistema" (§117)
significa hoy.

`SUPABASE_SERVICE_ROLE_KEY` **nunca** lleva el prefijo `NEXT_PUBLIC_`: salta
todas las reglas de seguridad de la base de datos, y en el navegador sería
una llave maestra pública.

## 3. El cron

Ya está declarado en `apps/web/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cola", "schedule": "0 7 * * *" },
    { "path": "/api/cola", "schedule": "0 19 * * *" }
  ]
}
```

Dos veces al día, a las 07:00 y a las 19:00 UTC. El plan Hobby de Vercel
solo admite crons diarios (dos por proyecto) y rechaza `0 * * * *`;
cuando el plan permita más frecuencia se puede subir sin tocar nada más,
porque las funciones son idempotentes y los avisos esperan en cola.

Por qué esas dos horas, desde el Hito 11: el barrido de Menú Diario
(`run_daily_menu_sweep()`) recuerda al restaurante **a partir de las
20:00** de su zona si no tiene menú para mañana (RN-MEN-08) y avisa al
equipo **a partir de las 08:00** de las publicaciones garantizadas que
siguen sin publicar (§62). Madrid es UTC+2 en verano y UTC+1 en invierno,
así que `0 19` cae a las 21:00 o a las 20:00 locales (siempre después de
las 20:00) y `0 7` a las 09:00 o a las 08:00 (siempre después de las
08:00). El barrido mira la hora local y deduplica por día, así que da
igual que llegue tarde o que se ejecute dos veces; lo que no puede es
llegar ANTES, y por eso no valen `0 18` ni `0 6`. La ruta está protegida:
sin la cabecera correcta responde 401, y si no hay ningún secreto
configurado responde 503 en vez de quedarse abierta.

**Por qué `CRON_SECRET` y no `QUEUE_RUNNER_SECRET`**: el cron de Vercel manda
él solo `Authorization: Bearer <CRON_SECRET>` cuando esa variable existe, y
no deja configurar otra cabecera. La ruta acepta las dos variables —basta
poner una— para no obligar a mantener el mismo valor duplicado. Con
cualquier otro programador de tareas, usa `QUEUE_RUNNER_SECRET` y manda tú
esa cabecera.

**La ruta responde a GET y a POST.** Es deliberado y está explicado en
`src/app/api/cola/route.ts`: el cron de Vercel invoca con GET.

### Lo que hay que confirmar en Vercel, y por qué no lo he confirmado yo

`vercel.com` está bloqueado por la política de salida del contenedor donde
se escribió esto, así que **estos tres puntos salen de lo que sé, no de la
documentación de Vercel leída hoy**. Confírmalos al desplegar:

1. **La frecuencia según el plan.** Ya confirmado: el plan Hobby rechaza
   `0 * * * *` y solo admite crons diarios, por eso el archivo declara dos
   crons diarios (`0 7` y `0 19`, ver arriba). Que el plan admita DOS
   crons en el mismo proyecto está escrito de memoria: si al desplegar
   solo admite uno, deja el de las 19:00 UTC (el recordatorio de las
   20:00 es el que no tiene sustituto) y el aviso de las 08:00 saldrá por
   la tarde. Sube la frecuencia cuando el plan lo permita. Nada se pierde
   por ir lento: las funciones son idempotentes y los avisos esperan en
   cola.
2. **`maxDuration`.** La ruta declara 60 segundos; si el plan permite
   menos, manda el plan. Una tanda procesa como mucho 10 tareas
   programadas y 20 correos, así que suele bastar con mucho menos.
3. **Que el cron llegue de verdad.** Se comprueba mirando el registro de
   ejecuciones del cron en Vercel, y en la respuesta: un 200 con
   `{"scheduled":…,"slaNotifications":…,"mail":…}`.

## 4. Comprobar que funciona

Con el proyecto desplegado, desde tu máquina:

```bash
curl -i -X POST https://<tu-dominio>/api/cola \
  -H "Authorization: Bearer <el secreto>"
```

- **200** con el resumen: la cola corre.
- **401**: el secreto no coincide.
- **503**: no hay ninguna variable de secreto configurada en ese entorno.

Sin la cabecera debe dar **401**. Si alguna vez responde 200 sin cabecera,
para y avisa: eso sería la cola abierta a internet.

## 5. Lo que sigue sin resolver

- **El primer envío real de correo no se ha visto nunca.** `drainEmailQueue()`
  tiene sus tests con un transporte falso, pero Resend de verdad, con su
  dominio verificado y su remitente, está sin probar. El primer despliegue
  es también la primera prueba.
- **El dominio de envío** (`RESEND_FROM`) tiene que estar verificado en
  Resend o los correos se quedarán en spam.
