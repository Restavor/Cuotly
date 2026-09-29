# Textos de los avisos al cliente

Variables: `{nombre}` (cliente), `{restaurante}`, `{fecha_larga}` (p. ej. "sábado 26 de septiembre" / "Saturday 26 September"), `{fecha_corta}` ("sáb 26/09" / "Sat 26/09"), `{hora}`, `{personas}`, `{direccion}`, `{telefono}` (del restaurante), `{enlace}` (página `/c/[token]`), `{enlace_corto}` (mismo enlace, versión corta para SMS).

Reglas: §6.11 del PRD. Nunca se envían para reservas de plataforma. Un solo canal por aviso: email si hay; si no, WhatsApp; si no es entregable, SMS.

---

## 1. Reserva confirmada (`confirmed`)
**Email · asunto ES:** Tu reserva en {restaurante} está confirmada
**Email · cuerpo ES:**
Hola, {nombre}:
Tu reserva está confirmada.
[recuadro] {fecha_larga} · {hora} — {personas} personas — {restaurante} · {direccion}
¿No puedes venir? Cancela tu reserva aquí: {enlace}
Para cualquier cambio, llámanos al {telefono}.
¡Hasta pronto! {restaurante}

**Email · asunto EN:** Your booking at {restaurante} is confirmed
**Email · cuerpo EN:**
Hi {nombre},
Your booking is confirmed.
[box] {fecha_larga} · {hora} — {personas} people — {restaurante} · {direccion}
Can't make it? Cancel your booking here: {enlace}
For any changes, call us on {telefono}.
See you soon! {restaurante}

**WhatsApp ES:** Hola, {nombre}. Tu reserva en {restaurante} está confirmada: {fecha_larga} · {hora} · {personas} personas. {direccion}. ¿Algún cambio? Llama al {telefono}. [Botón: Cancelar mi reserva → {enlace}]
**WhatsApp EN:** Hi {nombre}. Your booking at {restaurante} is confirmed: {fecha_larga} · {hora} · {personas} people. {direccion}. Any changes? Call {telefono}. [Button: Cancel my booking → {enlace}]
**SMS ES:** {restaurante}: reserva confirmada {fecha_corta} {hora}, {personas} pers. Cambios: {telefono}. Cancelar: {enlace_corto}
**SMS EN:** {restaurante}: booking confirmed {fecha_corta} {hora}, {personas} ppl. Changes: {telefono}. Cancel: {enlace_corto}

## 2. Solicitud recibida · grupo grande (`pending_received`)
**Email · asunto ES:** Hemos recibido tu solicitud en {restaurante}
**Cuerpo ES:** Hola, {nombre}: hemos recibido tu solicitud para {personas} personas el {fecha_larga} a las {hora}. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada. Si ya no la necesitas: {enlace}
**Asunto EN:** We've received your request at {restaurante}
**Cuerpo EN:** Hi {nombre}, we've received your request for {personas} people on {fecha_larga} at {hora}. The restaurant will call you to confirm it. It is not a confirmed booking yet. If you no longer need it: {enlace}
**WhatsApp ES:** Hola, {nombre}. Hemos recibido tu solicitud en {restaurante} para {personas} personas el {fecha_larga} a las {hora}. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada. [Botón: Cancelar mi solicitud → {enlace}]
**WhatsApp EN:** Hi {nombre}. We've received your request at {restaurante} for {personas} people on {fecha_larga} at {hora}. The restaurant will call you to confirm. It is not a confirmed booking yet. [Button: Cancel my request → {enlace}]
**SMS ES:** {restaurante}: solicitud recibida {fecha_corta} {hora}, {personas} pers. Te llamaremos para confirmar. Cancelar: {enlace_corto}
**SMS EN:** {restaurante}: request received {fecha_corta} {hora}, {personas} ppl. We'll call you to confirm. Cancel: {enlace_corto}

## 3. Grupo aceptado (`group_confirmed`)
**Email · asunto ES:** ¡Tu reserva en {restaurante} está confirmada!
**Email · cuerpo ES:** igual que "Reserva confirmada", empezando por "¡Buenas noticias, {nombre}! Tu reserva para {personas} personas está confirmada."
**Email · asunto EN:** Your booking at {restaurante} is confirmed!
**Email · cuerpo EN:** same as "Booking confirmed", starting with "Good news, {nombre}! Your booking for {personas} people is confirmed."
**WhatsApp ES:** ¡Buenas noticias, {nombre}! {restaurante} ha confirmado tu reserva: {fecha_larga} · {hora} · {personas} personas. {direccion}. ¿Algún cambio? Llama al {telefono}. [Botón: Cancelar mi reserva → {enlace}]
**WhatsApp EN:** Good news, {nombre}! {restaurante} has confirmed your booking: {fecha_larga} · {hora} · {personas} people. {direccion}. Any changes? Call {telefono}. [Button: Cancel my booking → {enlace}]
**SMS ES:** {restaurante}: grupo confirmado {fecha_corta} {hora}, {personas} pers. Cambios: {telefono}. Cancelar: {enlace_corto}
**SMS EN:** {restaurante}: group confirmed {fecha_corta} {hora}, {personas} ppl. Changes: {telefono}. Cancel: {enlace_corto}

## 4. Grupo rechazado (`group_rejected`)
**Email · asunto ES:** Tu solicitud en {restaurante}
**Email · cuerpo ES:** Hola, {nombre}: lo sentimos, no podemos atender tu solicitud para {personas} personas el {fecha_larga} a las {hora}. Si quieres buscar otra fecha, llámanos al {telefono}.
**Email · asunto EN:** Your request at {restaurante}
**Email · cuerpo EN:** Hi {nombre}, we're sorry, we can't accommodate your request for {personas} people on {fecha_larga} at {hora}. To find another date, call us on {telefono}.
**WhatsApp ES:** Hola, {nombre}. Lo sentimos, {restaurante} no puede atender tu solicitud para {personas} personas el {fecha_larga} a las {hora}. Para buscar otra fecha, llama al {telefono}. (sin botón)
**WhatsApp EN:** Hi {nombre}. We're sorry, {restaurante} can't accommodate your request for {personas} people on {fecha_larga} at {hora}. To find another date, call {telefono}. (no button)
**SMS ES:** {restaurante}: no podemos atender tu solicitud del {fecha_corta} {hora} ({personas} pers). Llama al {telefono} para otra fecha.
**SMS EN:** {restaurante}: we can't accommodate your request on {fecha_corta} {hora} ({personas} ppl). Call {telefono} for another date.

## 5. Reserva modificada (`modified`)
**Email · asunto ES:** Hemos cambiado tu reserva en {restaurante}
**Email · cuerpo ES:** Hola, {nombre}: tu reserva ahora es: {fecha_larga} · {hora} · {personas} personas. Si no te encaja, llámanos al {telefono} o cancela aquí: {enlace}
**Email · asunto EN:** Your booking at {restaurante} has changed
**Email · cuerpo EN:** Hi {nombre}, your booking is now: {fecha_larga} · {hora} · {personas} people. If it doesn't suit you, call us on {telefono} or cancel here: {enlace}
**WhatsApp ES:** Hola, {nombre}. Hemos cambiado tu reserva en {restaurante}. Ahora es: {fecha_larga} · {hora} · {personas} personas. Si no te encaja, llama al {telefono}. [Botón: Cancelar mi reserva → {enlace}]
**WhatsApp EN:** Hi {nombre}. Your booking at {restaurante} has changed. It is now: {fecha_larga} · {hora} · {personas} people. If it doesn't suit you, call {telefono}. [Button: Cancel my booking → {enlace}]
**SMS ES:** {restaurante}: tu reserva ahora es {fecha_corta} {hora}, {personas} pers. Dudas: {telefono}. Cancelar: {enlace_corto}
**SMS EN:** {restaurante}: your booking is now {fecha_corta} {hora}, {personas} ppl. Questions: {telefono}. Cancel: {enlace_corto}

## 6. Reserva cancelada (`cancelled`)
**Email · asunto ES:** Tu reserva en {restaurante} está cancelada
**Email · cuerpo ES:** Hola, {nombre}: tu reserva del {fecha_larga} a las {hora} para {personas} personas está cancelada. Si es un error o quieres otra fecha, llámanos al {telefono}.
**Email · asunto EN:** Your booking at {restaurante} has been cancelled
**Email · cuerpo EN:** Hi {nombre}, your booking on {fecha_larga} at {hora} for {personas} people has been cancelled. If this is a mistake or you'd like another date, call us on {telefono}.
**WhatsApp ES:** Hola, {nombre}. Tu reserva en {restaurante} del {fecha_larga} a las {hora} para {personas} personas está cancelada. Si es un error, llama al {telefono}. (sin botón)
**WhatsApp EN:** Hi {nombre}. Your booking at {restaurante} on {fecha_larga} at {hora} for {personas} people has been cancelled. If this is a mistake, call {telefono}. (no button)
**SMS ES:** {restaurante}: reserva cancelada {fecha_corta} {hora}, {personas} pers. Si es un error: {telefono}
**SMS EN:** {restaurante}: booking cancelled {fecha_corta} {hora}, {personas} ppl. If this is a mistake: {telefono}

> Los SMS se envían sin tildes ni eñes (la app los transforma sola: "sabado", "Espana") y en un solo mensaje de 160 caracteres como máximo; si no caben, se acorta el nombre del restaurante. Las plantillas de WhatsApp se dan de alta en Meta con estos textos (categoría "utilidad").

---

## Respuesta automática de WhatsApp
**ES:** Este número solo envía avisos y no lee mensajes. Para cualquier cosa, llama a {restaurante}: {telefono}.
**EN:** This number only sends notifications and can't read messages. For anything, please call {restaurante}: {telefono}.
Si no se puede saber de qué restaurante es: "Este número solo envía avisos de reservas y no lee mensajes. Llama directamente al restaurante." / "This number only sends booking notifications and can't read messages. Please call the restaurant directly."

## Pie de todos los emails
ES: Recibes este email porque has reservado en {restaurante}. Reservas con Restavor. Privacidad: {LEGAL_PRIVACY_URL}
EN: You're receiving this email because you booked at {restaurante}. Bookings with Restavor. Privacy: {LEGAL_PRIVACY_URL}
