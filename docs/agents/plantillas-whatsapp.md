# Plantillas de WhatsApp de Restavor agents › Reservas

Las doce plantillas (seis avisos × español e inglés) que hay que dar de alta en **Meta Business (WhatsApp Manager)** para que los avisos a comensales salgan por WhatsApp (decisión 151; PRD §6.11, AVI-03). Son las que
usa el código (`WHATSAPP_TEMPLATES` en `apps/web/src/core/reservations/notice-texts.ts`): **un test comprueba que este documento y el código dicen lo mismo** (`whatsapp-plantillas-doc.test.ts`). Si se cambia una, se
cambia la otra, y la plantilla de Meta se vuelve a enviar a aprobar.

Reglas que cumplen todas, y que Meta exige:

- Categoría **Utilidad** (no marketing): son avisos de una reserva que el comensal ha hecho.
- **Como máximo 5 variables**, numeradas `{{1}}`, `{{2}}`…; ninguna plantilla empieza ni acaba en una variable; ninguna variable lleva saltos de línea ni tabuladores.
- El **nombre** (`restavor_<aviso>`) es el mismo en español y en inglés: en Meta se crea una plantilla por nombre y se añade la traducción en el otro idioma (`es` y `en`).
- El botón (cuando lo hay) es de **URL dinámica**: la URL fija es `https://<tu dirección pública>/c/{{1}}` y el código rellena `{{1}}` con los 32 caracteres del enlace del comensal. Es la dirección de `NEXT_PUBLIC_SITE_URL`
  (en producción, `https://restavor.com`). Las plantillas «grupo rechazado» y «reserva cancelada» no llevan botón.
- Los ejemplos de abajo son los que se escriben en el campo «Ejemplo» de cada variable al darlas de alta (Meta los pide); no son datos reales.

El paso a paso de Meta está en `docs/agents/guia-proveedores-de-avisos.md`.

### `restavor_confirmed` · Español (es) · Reserva confirmada

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `es`.
- Cuerpo (se pega tal cual):

```text
Hola, {{1}}. Tu reserva en {{2}} está confirmada: {{3}}. {{4}}. ¿Algún cambio? Llama al {{5}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` details → «sábado 21 de noviembre · 21:00 · 4 personas»
  - `{{4}}` address → «Calle Sierpes 12, 41004 Sevilla»
  - `{{5}}` phone → «+34954000000»
- Botón: «Cancelar mi reserva», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Hola, Ana García. Tu reserva en Casa Pepe está confirmada: sábado 21 de noviembre · 21:00 · 4 personas. Calle Sierpes 12, 41004 Sevilla. ¿Algún cambio? Llama al +34954000000.»

### `restavor_confirmed` · Inglés (en) · Reserva confirmada

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `en`.
- Cuerpo (se pega tal cual):

```text
Hi {{1}}. Your booking at {{2}} is confirmed: {{3}}. {{4}}. Any changes? Call {{5}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` details → «Saturday 21 November · 21:00 · 4 people»
  - `{{4}}` address → «Calle Sierpes 12, 41004 Sevilla»
  - `{{5}}` phone → «+34954000000»
- Botón: «Cancel my booking», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Hi Ana García. Your booking at Casa Pepe is confirmed: Saturday 21 November · 21:00 · 4 people. Calle Sierpes 12, 41004 Sevilla. Any changes? Call +34954000000.»

### `restavor_pending_received` · Español (es) · Solicitud recibida (grupo grande o reserva que pasa a pendiente)

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `es`.
- Cuerpo (se pega tal cual):

```text
Hola, {{1}}. Hemos recibido tu solicitud en {{2}} para {{3}}. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` request → «4 personas el sábado 21 de noviembre a las 21:00»
- Botón: «Cancelar mi solicitud», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Hola, Ana García. Hemos recibido tu solicitud en Casa Pepe para 4 personas el sábado 21 de noviembre a las 21:00. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada.»

### `restavor_pending_received` · Inglés (en) · Solicitud recibida (grupo grande o reserva que pasa a pendiente)

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `en`.
- Cuerpo (se pega tal cual):

```text
Hi {{1}}. We've received your request at {{2}} for {{3}}. The restaurant will call you to confirm. It is not a confirmed booking yet.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` request → «4 people on Saturday 21 November at 21:00»
- Botón: «Cancel my request», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Hi Ana García. We've received your request at Casa Pepe for 4 people on Saturday 21 November at 21:00. The restaurant will call you to confirm. It is not a confirmed booking yet.»

### `restavor_group_confirmed` · Español (es) · Grupo aceptado

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `es`.
- Cuerpo (se pega tal cual):

```text
¡Buenas noticias, {{1}}! {{2}} ha confirmado tu reserva: {{3}}. {{4}}. ¿Algún cambio? Llama al {{5}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` details → «sábado 21 de noviembre · 21:00 · 4 personas»
  - `{{4}}` address → «Calle Sierpes 12, 41004 Sevilla»
  - `{{5}}` phone → «+34954000000»
- Botón: «Cancelar mi reserva», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «¡Buenas noticias, Ana García! Casa Pepe ha confirmado tu reserva: sábado 21 de noviembre · 21:00 · 4 personas. Calle Sierpes 12, 41004 Sevilla. ¿Algún cambio? Llama al +34954000000.»

### `restavor_group_confirmed` · Inglés (en) · Grupo aceptado

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `en`.
- Cuerpo (se pega tal cual):

```text
Good news, {{1}}! {{2}} has confirmed your booking: {{3}}. {{4}}. Any changes? Call {{5}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` details → «Saturday 21 November · 21:00 · 4 people»
  - `{{4}}` address → «Calle Sierpes 12, 41004 Sevilla»
  - `{{5}}` phone → «+34954000000»
- Botón: «Cancel my booking», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Good news, Ana García! Casa Pepe has confirmed your booking: Saturday 21 November · 21:00 · 4 people. Calle Sierpes 12, 41004 Sevilla. Any changes? Call +34954000000.»

### `restavor_group_rejected` · Español (es) · Grupo rechazado

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `es`.
- Cuerpo (se pega tal cual):

```text
Hola, {{1}}. Lo sentimos, {{2}} no puede atender tu solicitud para {{3}}. Para buscar otra fecha, llama al {{4}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` request → «4 personas el sábado 21 de noviembre a las 21:00»
  - `{{4}}` phone → «+34954000000»
- Botón: ninguno.
- Resultado de ejemplo: «Hola, Ana García. Lo sentimos, Casa Pepe no puede atender tu solicitud para 4 personas el sábado 21 de noviembre a las 21:00. Para buscar otra fecha, llama al +34954000000.»

### `restavor_group_rejected` · Inglés (en) · Grupo rechazado

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `en`.
- Cuerpo (se pega tal cual):

```text
Hi {{1}}. We're sorry, {{2}} can't accommodate your request for {{3}}. To find another date, call {{4}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` request → «4 people on Saturday 21 November at 21:00»
  - `{{4}}` phone → «+34954000000»
- Botón: ninguno.
- Resultado de ejemplo: «Hi Ana García. We're sorry, Casa Pepe can't accommodate your request for 4 people on Saturday 21 November at 21:00. To find another date, call +34954000000.»

### `restavor_modified` · Español (es) · Reserva modificada

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `es`.
- Cuerpo (se pega tal cual):

```text
Hola, {{1}}. Hemos cambiado tu reserva en {{2}}. Ahora es: {{3}}. Si no te encaja, llama al {{4}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` details → «sábado 21 de noviembre · 21:00 · 4 personas»
  - `{{4}}` phone → «+34954000000»
- Botón: «Cancelar mi reserva», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Hola, Ana García. Hemos cambiado tu reserva en Casa Pepe. Ahora es: sábado 21 de noviembre · 21:00 · 4 personas. Si no te encaja, llama al +34954000000.»

### `restavor_modified` · Inglés (en) · Reserva modificada

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `en`.
- Cuerpo (se pega tal cual):

```text
Hi {{1}}. Your booking at {{2}} has changed. It is now: {{3}}. If it doesn't suit you, call {{4}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` details → «Saturday 21 November · 21:00 · 4 people»
  - `{{4}}` phone → «+34954000000»
- Botón: «Cancel my booking», tipo URL dinámica `https://restavor.com/c/{{1}}` (ejemplo de la variable: `0123456789abcdef0123456789abcdef`).
- Resultado de ejemplo: «Hi Ana García. Your booking at Casa Pepe has changed. It is now: Saturday 21 November · 21:00 · 4 people. If it doesn't suit you, call +34954000000.»

### `restavor_cancelled` · Español (es) · Reserva cancelada

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `es`.
- Cuerpo (se pega tal cual):

```text
Hola, {{1}}. Tu reserva en {{2}} del {{3}} está cancelada. Si es un error, llama al {{4}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` when → «sábado 21 de noviembre a las 21:00 para 4 personas»
  - `{{4}}` phone → «+34954000000»
- Botón: ninguno.
- Resultado de ejemplo: «Hola, Ana García. Tu reserva en Casa Pepe del sábado 21 de noviembre a las 21:00 para 4 personas está cancelada. Si es un error, llama al +34954000000.»

### `restavor_cancelled` · Inglés (en) · Reserva cancelada

- Categoría: **Utilidad** (UTILITY). Idioma en Meta: `en`.
- Cuerpo (se pega tal cual):

```text
Hi {{1}}. Your booking at {{2}} on {{3}} has been cancelled. If this is a mistake, call {{4}}.
```

- Variables, en orden, con el ejemplo que se da a Meta:
  - `{{1}}` name → «Ana García»
  - `{{2}}` restaurant → «Casa Pepe»
  - `{{3}}` when → «Saturday 21 November at 21:00 for 4 people»
  - `{{4}}` phone → «+34954000000»
- Botón: ninguno.
- Resultado de ejemplo: «Hi Ana García. Your booking at Casa Pepe on Saturday 21 November at 21:00 for 4 people has been cancelled. If this is a mistake, call +34954000000.»
