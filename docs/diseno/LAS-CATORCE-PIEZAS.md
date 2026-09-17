# Las catorce piezas sueltas del diseño

Triaje escrito el 17/09/2026, antes de tocar código, contra el esquema real
(98 migraciones) y contra el PRD. Sale de la última lista de
`MAPA-DEL-DISENO.md`: lo que el diseño definitivo da por hecho y la
aplicación no tiene.

La pregunta que contesta este documento es una sola: **¿de dónde salen las
reglas de cada pieza?** Porque tres cosas distintas se parecen mucho vistas
desde una maqueta:

- las que ya tienen servidor y solo les falta pantalla;
- las que necesitan servidor nuevo, pero cuyas reglas el PRD ya da;
- las que necesitan una **decisión** que no está escrita en ninguna parte, y
  que CLAUDE.md prohíbe inventar.

Cinco de las catorce son del tercer grupo. Están al final, cada una con la
pregunta concreta.

---

## A · Solo falta la pantalla (seis)

El servidor ya existe y se ha comprobado contra la base, no de memoria.

| Pieza | Vista | Lo que ya hay |
|---|---|---|
| Grupos de restaurantes | M82 | Las tablas `groups` y `group_memberships`, con sus políticas. El acceso de un cliente a todo un grupo ya se concede (`grant_group_current_establishments_access`, `grant_group_future_establishments_access`). |
| Vista de tablero en Trabajos | M09 | Los once estados de `jobs` y sus transiciones. Es la misma lista de siempre agrupada por estado; no hay dato nuevo. |
| Impuestos del espacio | M58 | `spaces.tax_rate_percent`, `payment_term_days`, `legal_name`, `tax_id` y `address`, y `set_space_payment_term()`. |
| Copiar un borrador a otro restaurante | R07 | `copy_paste_request(origen, destino)`. |
| Copiar el menú anterior | R13 | `copy_menu(menu_id, fecha, nombre)`. |
| Pagos parciales de un presupuesto | M51 | `register_payment()` **ya recibe un importe**, y `charge_status()` devuelve `partially_paid` y `charge_collected_cents()`. Los pagos parciales funcionan; lo que falta es enseñar el historial. |

Dos avisos sobre la de impuestos, para no pintar un selector donde no hay
elección:

- **La moneda es el euro y no hay columna para otra.** Enseñarla como un
  desplegable de un elemento es un adorno; se enseña como lo que es.
- **Los métodos de pago son transferencia y Bizum**, y están fijados en el
  CHECK de `payments.method` por la decisión de no usar Stripe. Tampoco es
  una preferencia del espacio: es lo que Cuotly acepta.

## B · Falta servidor, pero las reglas ya están en el PRD (cinco)

Aquí no hay nada que decidir: el PRD dice qué tiene que pasar y lo que falta
es escribirlo.

| Pieza | Vista | La regla que manda | Lo que falta |
|---|---|---|---|
| Restaurantes archivados y reactivar | M84 | `establishments.status` ya incluye `archived`, y `set_establishment_status()` mueve el estado con motivo (RN-EST-08). | El filtro en el listado y la acción de reactivar. |
| Cancelar una solicitud el restaurante | R12, A14 | Los estados `cancelled_before_start` y `cancelled_after_start` existen, y `cancel_accepted_request()` también — **para el equipo**. | Que lo pueda hacer el restaurante mientras la solicitud no esté completada, y el estado "Cancelada" en los filtros. |
| Comparar versiones del menú | R18 | `menu_versions` guarda cada versión con su número y su contenido. | El cálculo de qué cambió entre dos versiones, que es lógica de dominio y va en `src/core`. |
| Edición simultánea del menú | A17 | El número de versión ya distingue una edición de otra. | El aviso de "alguien guardó mientras escribías" y la comparación de las dos. |
| Solicitar la baja del servicio | R24, M47 | **RN-EST-09** lo dice entero: "el restaurante ha comunicado la baja pero el servicio sigue activo hasta el final del periodo pagado o de la permanencia vigente", y después 24 h en solo lectura (RN-EST-10). El estado `ending` existe. | Que el restaurante pueda comunicarla, y que el equipo pueda registrar la que llegó por fuera. |

## C · Necesitan una decisión, y por eso no se construyen (cinco)

Ninguna de estas cinco tiene reglas en el PRD ni en la maestra. Construirlas
significaría inventarlas, que es justo lo que CLAUDE.md prohíbe. Cada una va
con la pregunta que hace falta contestar.

### C1 · Transferir un restaurante a otro espacio (M84)

La maqueta enseña mover un establecimiento a otro espacio de mantenimiento,
con el aviso de que solo puede estar activo en uno.

No está escrito **qué se lleva consigo**, y no es un detalle: un restaurante
arrastra solicitudes, trabajos, consumos del ciclo, cobros, pagos, archivos,
conversaciones y auditoría. Las preguntas son tres:

1. ¿El historial **viaja** con el restaurante, o **se queda** en el espacio
   de origen y el nuevo empieza de cero?
2. ¿Quién lo autoriza? ¿Basta el propietario del espacio de origen, hace
   falta que el de destino lo acepte, o lo hace Cuotly?
3. ¿Qué pasa con los **cobros abiertos** y con la permanencia en curso?

### C2 · Copias de seguridad del contenido del restaurante (M83)

No existe nada: ni tabla, ni proceso, ni una línea en el PRD. La maqueta
enseña un historial de respaldos, una descarga y una revisión de
restauración.

1. ¿Qué se respalda exactamente? ¿La web del restaurante —que Cuotly no
   aloja— o **lo que hay dentro de Cuotly** de ese restaurante?
2. ¿Cada cuánto, y cuántos se guardan?
3. "Restaurar", ¿qué significa: descargar y que lo aplique el equipo a mano,
   o que Cuotly deshaga algo?

Mientras no haya respuesta, esta es la más fácil de dejar bien dicha: una
pantalla que explique que todavía no hay copias y por qué es mejor que una
que enseñe un historial vacío como si fuera a llenarse solo.

### C3 · Canales de mensajería interna (M76)

La maqueta enseña General, Proyectos web, Menú diario, Redes sociales y los
que el equipo cree, con miembros por canal.

Hoy `conversations.type` es un CHECK cerrado con tres valores —solicitud,
interna de trabajo y establecimiento— y **quién lee cada una la decide
`can_read_conversation()`** a partir de la solicitud, el trabajo o el
restaurante del que cuelga. Un canal no cuelga de ninguno de los tres: es una
cuarta cosa, con su propia lista de miembros.

1. ¿Un canal es **del espacio** y sus miembros se eligen a mano, o hereda de
   algún permiso que ya exista?
2. ¿Los cuatro nombres de la maqueta son **fijos** o son solo un ejemplo de
   los que el equipo puede crear?
3. ¿Se pueden archivar? (Borrar no: CLAUDE.md no lo permite.)

### C4 · Alérgenos en el editor del menú (R14)

**No aparece en el PRD ni en la especificación maestra.** Es la única de las
catorce que toca materia legal: la información de alérgenos en la carta es
una obligación del restaurante, y Cuotly publicaría lo que el restaurante
declare.

1. ¿Es **texto libre** por plato, o la lista de los catorce alérgenos de la
   normativa europea con casillas?
2. Si es la lista, ¿quién responde de que esté bien: el restaurante que la
   marca, con un aviso escrito en la pantalla?

Esto encaja mejor con el **paso 4** del orden acordado —el bloque legal, que
CLAUDE.md manda que revise un profesional— que con esta tanda. Se puede
construir antes si lo decides, pero conviene saber que va con ese paquete.

### C5 · Recordatorios de cobro, primero, segundo y tercero (M52)

La maqueta enseña tres avisos. El PRD tiene **dos umbrales**: RN-FIN-10 a las
+24 h del vencimiento (pausa) y RN-FIN-11 a las +72 h (suspensión). Un tercer
umbral inventado sería exactamente lo que CLAUDE.md prohíbe.

**Propuesta, sin inventar ninguno**: los tres avisos son el **vencimiento**
(que ya está en `charges.due_at`), las **+24 h** y las **+72 h**. Encaja con
la maqueta y no añade ningún número nuevo.

Hace falta confirmarlo, porque hoy solo existen dos avisos para el
restaurante —`establishment_paused_nonpayment` y
`establishment_suspended_nonpayment`— y el del vencimiento habría que
añadirlo.
