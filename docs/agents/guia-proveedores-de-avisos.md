# Guía: activar los avisos reales (correo, WhatsApp y SMS)

Para Bosco. Los avisos a comensales de Reservas (Fase F) están **construidos y probados con un proveedor falso**. Esta guía dice qué cuentas abrir y qué variables poner para que salgan de verdad. No hace falta tocar
código: todo se activa con variables de entorno en Vercel.

**Regla general:** todo primero en **Preview** (la rama `agents`, contra «Restavor pruebas») y con tus propios teléfono y correo. **Nada en Production** hasta que lo pidas (`CLAUDE.md`). Las pantallas de los
proveedores cambian de nombre con frecuencia: si algún botón no se llama como aquí, busca el equivalente; lo importante son los datos que hay que copiar.

Qué se puede activar por separado: **correo, WhatsApp y SMS son independientes**. Puedes empezar solo con el correo (es gratis) y dejar WhatsApp y SMS para después; cada restaurante, además, elige desde Ajustes ›
Conexiones cuáles de los tres usa (decisión 152). Un canal sin sus variables **no rompe nada**: el aviso queda «no enviado: el envío de avisos no está configurado» en la ficha, y deja un incidente para Restavor.

## 0. Antes de nada

1. **Tarifas.** WhatsApp y SMS se descuentan del saldo del restaurante al precio real. Sin tarifa del país del número, el aviso **no sale** (`no_rate`). En **Administración › Reservas › Tarifas de mensajería** carga
   la de WhatsApp (utilidad) y la de SMS de cada país donde vayan a recibir avisos (España para empezar, Portugal, Francia, Reino Unido…): el precio que te cobra cada proveedor, sin margen (RN-AGT-03). El sembrado trae
   tarifas **de prueba** (0,016 € y 0,08 €); las reales las cargas tú. Hace falta el segundo paso (`aal2`).
2. **Tus pruebas, a salvo.** Pon en Vercel (solo Preview) `MESSAGING_RECIPIENT_ALLOWLIST` con **tu correo y tu móvil** (en formato internacional, `+34600123456`), separados por comas. Con proveedor real fuera de
   producción, **solo se envía a esa lista**: así ningún restaurante de prueba ni comensal inventado recibe nada de verdad. En producción no se mira.
3. **Variables de Vercel:** Settings › Environment Variables, marca solo **Preview** y la rama `agents`; después, «Redeploy». Las claves **nunca** se pegan en el chat, en un correo ni en un archivo del repositorio.
4. **La vista previa de Vercel está protegida** y bloquea lo que no lleve sesión de Vercel: los **webhooks** de los proveedores y los enlaces `/c/…` del comensal. En Settings › Deployment Protection añade una
   excepción para `/api/agents/webhooks/*` y `/c/*` (o usa un «Protection Bypass for Automation» y pásalo a los proveedores si lo permiten). Sin esto, los avisos salen pero **no se entera nadie de si llegaron** y el
   respaldo de WhatsApp a SMS no funciona.
5. **El trabajo de cada minuto** (reintentos): ejecuta una vez `supabase/operaciones/agents-cron.sql` en Restavor pruebas y pon en Vercel `CRON_SECRET` (el mismo que ya usan los otros trabajos).

## 1. Correo (Resend): el más sencillo y gratis para el restaurante

1. En **resend.com**, abre sesión con la cuenta de Restavor (la de `RESEND_API_KEY`, que ya existe para los otros correos).
2. **Domains**: el dominio tiene que estar **verificado**, y tiene que ser `restavor.com` (no solo `mail.restavor.com`) porque los avisos salen de `reservas@restavor.com` con el nombre del restaurante delante («Casa Pepe
   <reservas@restavor.com>»). Si no está, «Add Domain» y copia los registros DNS (SPF y DKIM) donde esté tu DNS; espera a que Resend ponga «Verified».
3. **Webhooks › Add Webhook**: dirección `https://<tu dirección de la vista previa>/api/agents/webhooks/email`, eventos **email.delivered**, **email.bounced** y **email.failed**. Al crearlo, Resend enseña el
   **Signing secret** (`whsec_…`): cópialo.
4. Variables (Preview):
   - `RESEND_API_KEY` (ya está)
   - `RESERVATIONS_EMAIL_ADDRESS` = `reservas@restavor.com`
   - `RESEND_WEBHOOK_SECRET` = el `whsec_…` del paso anterior
   - `LEGAL_PRIVACY_URL` (opcional): la dirección de tu política de privacidad para el pie de los correos. **Sin ella el pie sale sin enlace**; no se inventa ninguno (bloque legal aplazado, `CLAUDE.md`).
     `LEGAL_TERMS_URL` (los términos) todavía no la usa ningún aviso.
5. **Prueba:** con tu correo en la lista permitida, crea una reserva con tu email en el restaurante de pruebas. Debe llegarte «Tu reserva en … está confirmada» con el botón de cancelar, y en la ficha de la reserva
   el aviso pasa a «enviado». Un correo a una dirección que no existe rebota: la ficha lo dice y queda un incidente.

## 2. WhatsApp (Meta Cloud API)

Es lo más largo, porque Meta revisa la empresa y las plantillas. Cuenta con **varios días** de espera.

1. En **business.facebook.com** (Meta Business Suite), crea o abre la cuenta de empresa de Restavor y **verifícala** (Configuración › Centro de seguridad › Verificación de la empresa). Meta te pedirá documentos de la
   empresa.
2. En **developers.facebook.com › Mis apps › Crear app** (tipo «Empresa»), añade el producto **WhatsApp**. Vincula la cuenta de empresa y crea una **cuenta de WhatsApp Business**.
3. **Un número dedicado.** Añade un número de teléfono que **no esté ya en WhatsApp** ni en la app de WhatsApp Business y que pueda recibir un SMS o llamada de verificación. Será el remitente de todos los
   restaurantes: los comensales verán el nombre que registres («Restavor»). Apunta el **Phone number ID** (WhatsApp › Configuración de la API): no es el número, es un identificador largo.
4. **Token permanente.** Configuración de la empresa › Usuarios › **Usuarios del sistema** › crea uno (administrador), «Generar token», elige la app y marca `whatsapp_business_messaging` y
   `whatsapp_business_management`; sin caducidad. Es `WHATSAPP_ACCESS_TOKEN`. (El token temporal de 24 h de la pantalla de pruebas sirve solo para ensayar.)
5. **Secreto de la app:** Configuración de la app › Básica › **Secreto de la app** → `WHATSAPP_APP_SECRET` (con él se comprueba que los avisos de estado vienen de Meta).
6. **Webhook:** WhatsApp › Configuración › Webhook › Editar: «URL de devolución de llamada» = `https://<tu dirección de la vista previa>/api/agents/webhooks/whatsapp` y «Token de verificación» = una palabra que
   inventes (será `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; pon la variable en Vercel y redespliega **antes** de pulsar «Verificar y guardar», porque Meta llama enseguida). Después, en los campos del webhook,
   **suscríbete a `messages`**: sin esa suscripción Meta no manda los estados (entregado, no entregable…) y el respaldo por SMS no se activaría.
7. **Plantillas:** WhatsApp Manager › Plantillas de mensajes › Crear. Hay que dar de alta **las 12** de `docs/agents/plantillas-whatsapp.md` (6 avisos × español e inglés), con ese nombre, categoría **Utilidad**, el
   cuerpo tal cual, los ejemplos de las variables y el botón de URL dinámica donde lo dice. Meta suele aprobarlas en minutos u horas; si rechaza alguna, avisa: hay que ajustar el texto en el código y en el documento a
   la vez (un test los compara).
8. Variables (Preview): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y, si Meta retira la versión de su API, `WHATSAPP_GRAPH_VERSION` (por defecto la que
   trae el código, `v23.0`).
9. **Cobro:** Meta cobra por conversación/mensaje de utilidad según el país del destinatario; ese precio es el que has cargado como tarifa en el paso 0. Si Meta cobra distinto, corrige la tarifa (una fila nueva).
10. **Prueba:** con tu móvil en la lista permitida y **permiso de WhatsApp** marcado, crea una reserva solo con tu teléfono (sin email). Debe llegarte el WhatsApp con el botón «Cancelar mi reserva». El saldo baja la
    tarifa de WhatsApp. Con un número sin WhatsApp (o apagándolo en tu cuenta) el aviso debe salir por SMS.

## 3. SMS (proveedor compatible con Twilio)

El código habla el idioma de **Twilio** (por eso los nombres `SMS_ACCOUNT_SID` y `SMS_AUTH_TOKEN`); otro proveedor sirve si ofrece una API compatible.

1. Crea la cuenta en **twilio.com** y, en la consola, copia el **Account SID** (`SMS_ACCOUNT_SID`) y el **Auth Token** (`SMS_AUTH_TOKEN`).
2. **Remitente «Restavor».** En España y en otros países el remitente alfanumérico se **registra** (en España, ante la **CNMC**: el proveedor tiene un asistente para el «Sender ID» y pide datos de la empresa).
   `SMS_SENDER_ID` = `Restavor` (de 1 a 11 letras o cifras, sin espacios; si falta, se usa «Restavor»). Mientras no esté registrado, los SMS a España pueden rechazarse o salir con un número en su lugar.
3. **Webhook de estado:** no hay que configurarlo a mano: cada SMS lleva su propia dirección de estado (`https://<tu dirección>/api/agents/webhooks/sms?notice=<id>`). Lo único que hay que tener es la excepción de
   Vercel del paso 0. La firma se comprueba con el Auth Token.
4. **Precio real:** el proveedor informa del precio de cada SMS un poco después del envío; Restavor lo consulta cada 10 minutos (hasta 20 veces) y corrige el apunte del saldo. Si el precio llega en otra moneda,
   la conversión usa el cambio del BCE (`fx_rates`, Fase G): hasta entonces, un SMS en dólares queda con el precio provisional y deja un incidente.
5. Variables (Preview): `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN` y `SMS_SENDER_ID`.
6. **Prueba:** con tu móvil en la lista permitida, crea una reserva solo con teléfono con WhatsApp apagado en Conexiones. Debe llegarte un SMS **sin tildes ni eñes**, de un solo mensaje, con el enlace corto.

## 4. Antes de pasar a Production

Esto es para cuando lo decidas, no antes:

- Cada proveedor funcionando en Preview con tu lista permitida, incluido el respaldo de WhatsApp a SMS y el precio real del SMS.
- Confirmar los **códigos de error** de Meta y del proveedor de SMS (`apps/web/src/core/reservations/provider-errors.ts` los clasifica con lo que se conocía al construirlo; un código desconocido se trata como
  temporal con tope, que es lo seguro).
- Las **mismas variables** en Production, sin `ENABLE_FAKE_MESSAGING` (con `VERCEL_ENV=production` se ignora aunque esté) y **sin `MESSAGING_RECIPIENT_ALLOWLIST`** (en producción no se mira).
- Tarifas reales cargadas y saldo en los restaurantes que vayan a usar WhatsApp o SMS.
- El bloque legal (términos y privacidad) revisado por un profesional **antes de dar de alta restaurantes reales** (decisión 97).

## Si algo no sale

- En la ficha de la reserva, el Historial dice el motivo en claro («sin saldo», «falta la tarifa del país de ese teléfono», «el envío de avisos no está configurado», «destinatario no permitido en este
  entorno»…).
- Los incidentes (proveedor sin configurar, rechazado, tarifa ausente, datos del restaurante) quedan abiertos en la ficha de Reservas de Restavor, sin datos personales del comensal.
- Lanzar a mano el envío de lo pendiente: `curl -H "Authorization: Bearer <CRON_SECRET>" "https://<vista previa>/api/agents/cron/avisos"`.
- **Límite que conviene saber:** si el servidor se cae justo entre enviar y anotar, o un envío da tiempo agotado, un WhatsApp o un SMS puede salir **dos veces** (los proveedores no ofrecen clave de
  idempotencia; el correo sí). Se cobra una sola vez.
