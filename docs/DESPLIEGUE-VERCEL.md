# Desplegar Cuotly en Vercel

Este archivo dice **qué hay que configurar en Vercel** para que Cuotly
funcione sola: la aplicación web y, sobre todo, el cron que dispara la cola.

Escrito el 02/09/2026. Todavía **no se ha desplegado nada**: esto es la
preparación, no un registro de lo hecho.

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

`SUPABASE_SERVICE_ROLE_KEY` **nunca** lleva el prefijo `NEXT_PUBLIC_`: salta
todas las reglas de seguridad de la base de datos, y en el navegador sería
una llave maestra pública.

## 3. El cron

Ya está declarado en `apps/web/vercel.json`:

```json
{ "crons": [{ "path": "/api/cola", "schedule": "0 * * * *" }] }
```

Cada hora en punto. La ruta está protegida: sin la cabecera correcta
responde 401, y si no hay ningún secreto configurado responde 503 en vez de
quedarse abierta.

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

1. **La frecuencia según el plan.** Los planes gratuitos limitan los crons
   (número y frecuencia; el horario de arriba puede no estar permitido). Si
   Vercel rechaza `0 * * * *`, pon `0 6 * * *` —una vez al día— y sube la
   frecuencia cuando el plan lo permita. Nada se pierde por ir lento: las
   funciones son idempotentes y los avisos esperan en cola.
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
