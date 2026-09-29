# Guía para conectar tu agente de llamadas a Reservas

Para Bosco (Restavor). Sirve para el agente actual (n8n + ElevenLabs) y para el agente propio que hagas con Claude Code. Claude Code debe mantener esta guía al día al terminar la Fase G, con ejemplos reales.

---

## 1. La idea en una frase
Tu agente sigue hablando con el cliente como hasta ahora. Cuando necesita saber algo del restaurante, si hay sitio, o apuntar, buscar, cambiar o cancelar una reserva, **le pregunta a la app** y la app le contesta. Al colgar, **le cuenta a la app cómo fue la llamada** (para el registro y para descontar el saldo). Y antes de coger una llamada, le puede preguntar a la app si debe cogerla o pasarla al local.

## 2. Lo que necesitas
- **Dirección:** `https://app.restavor.com/api/agents/v1`
- **Clave del restaurante:** en tu espacio de Restavor › Restaurantes › (restaurante) › pestaña **Reservas** › "Clave del agente" › "Crear clave". Se ve completa **una sola vez**: cópiala en tu agente. Cada restaurante tiene la suya.
- En cada petición: cabecera `Authorization: Bearer <clave>`.
- Todas las respuestas usan nombres en `snake_case` y teléfonos con prefijo `+34`. Añade `?lang=en` si la llamada es en inglés y los `message` vendrán en inglés.

## 3. Antes de coger: ¿cojo o paso la llamada?
- **Petición:** `GET /agent/route?caller=%2B34612345678&call_id=conv_8f2a` (manda siempre el `call_id`: así, si la llamada se pasa al local, también queda apuntada en Llamadas como "No la cogió")
- **Respuesta:** `{ "action": "answer" }` o `{ "action": "forward", "forward_to": "+34600123456", "reason": "manual_off" }`
- Motivos para pasarla: `service_paused` (Reservas en pausa por impago o ya cerrada), `manual_off` (el restaurante lo ha apagado), `outside_hours` (fuera de su horario), `no_balance` (sin saldo).
- En la centralita (Twilio o la de tu proveedor), esto se pone en el paso que recibe la llamada: si `forward`, se desvía al número que te da la app sin que hable el agente.

## 4. Lo que sabe el agente del restaurante
- **Petición:** `GET /agent/knowledge` → `{ "version": 14, "updated_at": "…", "content": "…texto con todo lo que sabe…" }`
- Es la **ficha de conocimiento**: horario, dirección, teléfonos, grupos, antelación, preguntas frecuentes, instrucciones del restaurante, el texto de sus documentos (carta, alérgenos…) y el de su web. Cambia cuando el restaurante toca la pestaña Información.
- Para no descargarla en cada llamada: `GET /agent` devuelve `knowledge_version`; si no ha cambiado, usa la que ya tienes. También puedes mandar `If-None-Match: "14"` (la versión entre comillas): si no ha cambiado, la app responde `304` sin cuerpo.
- En ElevenLabs puedes: (a) llamar a `/agent/knowledge` al empezar cada llamada y pasárselo al agente como contexto, o (b) cuando esté el conector, que la app la suba sola a la base de conocimiento del agente.

## 5. Las herramientas de reservas

### 5.1 `consultar_restaurante`
- **Cuándo:** al empezar la llamada.
- **Petición:** `GET /restaurant`
```json
{ "name": "Casa Pepe", "phone": "+34954000000", "transfer_phone": "+34600123456",
  "service_status": "active", "large_group_threshold": 9,
  "shifts": [ { "name": "Comida", "weekdays": [2,3,4,5,6,7], "from": "13:00", "last_booking": "15:00" },
              { "name": "Cena",   "weekdays": [2,3,4,5,6,7], "from": "20:00", "last_booking": "22:30" } ],
  "closed_dates": [ { "date": "2026-10-12", "reason": "Festivo" } ] }
```
(`weekdays`: 1 = lunes … 7 = domingo. `closed_dates`: días cerrados especiales de los próximos 60 días.)

### 5.2 `consultar_disponibilidad`
- **Cuándo:** cuando el cliente dice día, hora y personas. Es como mirar el calendario.
- **Petición:** `GET /availability?date=2026-09-27&party_size=4&time=21:00`
```json
{ "date": "2026-09-27",
  "requested": { "time": "21:00", "available": false, "reason": "full",
                 "message": "El domingo a las 21:00 no nos queda sitio para 4 personas." },
  "alternatives": [ { "date": "2026-09-29", "time": "21:00" },
                    { "date": "2026-09-30", "time": "21:00" },
                    { "date": "2026-10-01", "time": "21:00" } ],
  "slots": [ { "time": "13:00", "shift": "Comida", "available": true, "requires_confirmation": false }, "…" ],
  "restaurant": { "name": "Casa Pepe", "transfer_phone": "+34600123456" } }
```
- Si el restaurante trabaja por tandas, primero salen horas libres del mismo día; si no, la misma hora otros días.
- `not_a_slot`: la hora no existe (21:15 con reservas cada 30 min), con alternativas.
- `requires_confirmation: true`: grupo grande; se apuntará como **pendiente** y el restaurante llamará.

### 5.3 `crear_reserva`
- **Petición:** `POST /reservations` con `Idempotency-Key: <id de la llamada>-<fecha>-<hora>` (por ejemplo `conv_8f2a-2026-09-29-21:00`). Misma clave con otros datos → `idempotency_conflict`.
```json
{ "date": "2026-09-29", "time": "21:00", "party_size": 4,
  "customer_name": "Marta López", "phone": "+34612345678",
  "notes": "Una trona", "language": "es", "whatsapp_consent": true, "call_id": "conv_8f2a" }
```
- **Respuesta:** `{ "id": "…", "status": "confirmed", "summary": "Martes 29 de septiembre a las 21:00, 4 personas", "message": "Reserva confirmada" }`. Grupo grande: `"status": "pending"`.

### 5.4 `buscar_reserva`
`GET /reservations/search?phone=%2B34612345678` (o `?name=Marta%20López&date=2026-09-29` si llama desde otro número).

### 5.5 `cambiar_reserva`
`PATCH /reservations/{id}` con lo que cambie: `{ "time": "21:30" }`, `{ "party_size": 6 }`. Mismas reglas que crear.

### 5.6 `cancelar_reserva`
`POST /reservations/{id}/cancel`. **Antes**, el agente lee la reserva en voz alta y el cliente dice "sí".

## 6. Al colgar: contar cómo fue la llamada
- **Petición:** `POST /calls` (una vez por llamada; si se repite con el mismo `external_call_id`, no se cuenta dos veces)
```json
{ "external_call_id": "conv_8f2a", "started_at": "2026-09-26T11:30:12+02:00", "ended_at": "2026-09-26T11:32:00+02:00",
  "caller": "+34612345678", "outcome": "booked",
  "summary": "Javier Ruiz · hoy 14:00 · 4 personas. Pidió una trona.",
  "cost": { "amount": 0.2034, "currency": "USD" },
  "reservation_id": "…", "transferred_to": null }
```
- `outcome`: `booked`, `group_pending`, `modified`, `cancelled`, `question`, `transferred`, `hung_up`, `other`. (Las que no coge las apunta la app sola con `GET /agent/route`, como `forwarded`.)
- `summary`: **dos líneas** con lo que pidió y lo que pasó. No se envía la conversación entera ni la grabación.
- `cost`: lo que te ha costado la llamada de verdad (agente + IA + línea), en su moneda. La app lo pasa a euros y lo descuenta del saldo del restaurante.

## 7. Qué decir en cada caso
| Código | Qué pasa | Qué puede decir el agente |
|---|---|---|
| `full` | No cabe | "A esa hora no nos queda sitio. Te puedo ofrecer…" (+ alternativas) |
| `too_soon` | Muy justo | "Para hoy a esa hora ya no puedo apuntarla por aquí." (+ pasar llamada) |
| `too_far` | Demasiado lejos | "Todavía no tenemos abierta esa fecha." |
| `closed_day` | Día cerrado | "Ese día el restaurante está cerrado." (+ alternativas) |
| `not_a_slot` | Hora que no existe | "A esa hora exacta no damos mesa. Te puedo ofrecer…" |
| `service_paused` | Reservas en pausa (normalmente la llamada ni siquiera llega al agente) | "Ahora mismo no puedo gestionar reservas. Te paso con el restaurante." |
| `not_found` | No la encuentra | "No encuentro ninguna reserva con ese número. ¿A qué nombre está?" |
| `already_cancelled` | Ya estaba cancelada | "Esa reserva ya estaba cancelada." |
| `validation_error` | Falta un dato o está mal (por ejemplo, el teléfono) | Vuelve a pedir ese dato al cliente |
| `platform_locked` | Reserva de plataforma sin cambios | "Esa reserva la hiciste en <plataforma>; el cambio tienes que hacerlo allí." |
| `idempotency_conflict` | Clave repetida con otros datos | (error de configuración: revisa la `Idempotency-Key`) |
| `invalid_key` / `rate_limited` / otro | Fallo técnico | "Perdona, no puedo acceder a las reservas ahora mismo. Te paso con el restaurante." |

## 8. Guion recomendado
1. Saludo con el nombre del restaurante y **aviso de que es un asistente automático** ("Hola, has llamado a Casa Pepe, soy su asistente automático").
2. Si pregunta algo → responde con la ficha de conocimiento. Si no está, dilo y ofrece pasar con un trabajador.
3. Reserva: día, hora y personas → `consultar_disponibilidad` → alternativas si no hay sitio.
4. Nombre y "¿Te envío la confirmación por WhatsApp a este número?" → `whatsapp_consent`.
5. "¿Alguna alergia o petición?" → `notes`.
6. Repite el resumen → `crear_reserva` → di el `message`.
7. Despedida: "Gracias por llamar a {restaurante}. Si no hemos resuelto todas tus dudas, pulsa 1 y te pondremos en contacto con uno de los trabajadores." → pasa la llamada al `transfer_phone`.
8. Al colgar → `POST /calls`.
- **Nunca pidas el email por teléfono.** Idioma inglés → `"language": "en"`.

## 9. Configurarlo en ElevenLabs y n8n
- **ElevenLabs:** una herramienta de servidor (webhook) por cada herramienta de §5, con su nombre y descripción; cabecera `Authorization`; en `crear_reserva`, también `Idempotency-Key`. Transferir llamada con la herramienta de sistema (Twilio o SIP) al `transfer_phone`. Al terminar la conversación, un webhook de fin de llamada que haga `POST /calls` (directo o a través de n8n).
- **n8n:** un nodo HTTP Request por herramienta, con la clave guardada como credencial "Header Auth".
- **Centralita:** el paso de `GET /agent/route` va antes de conectar con el agente.

## 10. Probarlo
Mientras no conectes tu agente, la app trae un **agente falso** (tu espacio › Reservas › Pruebas › Agente falso, solo en el entorno de pruebas) que hace exactamente estas peticiones. Con tu agente real, prueba primero con Casa Pepe en el **entorno de pruebas** (la dirección de vista previa está en `docs/agents/PRUEBAS.md`) y con una clave de Casa Pepe creada allí:
```bash
curl -H "Authorization: Bearer <clave de pruebas>" "<dirección de pruebas>/api/agents/v1/availability?date=2026-09-27&party_size=4&time=21:00"
```
Cuando funcione, cambia a `https://app.restavor.com` y a la clave real del restaurante.
La reserva aparece al momento en Hoy con "Agente" y "Nueva", y la llamada en Agente de llamadas › Llamadas.

## 11. Si algo falla
- **401 `invalid_key`:** clave mal copiada o cambiada.
- **Reserva duplicada:** falta la `Idempotency-Key` o cambia en cada reintento.
- **La llamada no aparece en Llamadas:** falta el `POST /calls` al colgar.
- **Horas raras:** siempre hora del restaurante (España), 24 h `HH:MM`.
- Los errores del agente aparecen en tu espacio › Reservas › Incidentes.
