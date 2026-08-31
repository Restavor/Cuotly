# PRD — Cuotly · Fase 1

**Producto:** Cuotly · by Restavor
**Propietario:** Bosco Núñez (Restavor)
**Versión del documento:** 1.0 — 29 de agosto de 2026
**Alcance de este PRD:** Fase 1. Las fases 2 a 4 están en `ROADMAP.md`.

> Este PRD es la fuente autoritativa para la Fase 1. Incorpora las enmiendas acordadas el 29/08/2026
> sobre la especificación maestra. Donde este PRD y `ESPECIFICACION-MAESTRA.md` difieran, manda este PRD.
> Donde este PRD calle, la especificación maestra es la referencia — y si lo que falta es una regla de
> negocio con consecuencias, hay que preguntar, no deducir.

---

## 1. Contexto y problema

Restavor crea páginas web para restaurantes y después les vende mantenimiento de esas webs y servicios
de automatización. Hoy ese mantenimiento se gestiona sin un sistema: no hay control fiable de qué ha
pedido cada restaurante, qué cambios le quedan de su plan, quién está haciendo qué, cuánto tiempo queda
para cumplir el compromiso contraído, ni qué se ha cobrado.

Cuotly resuelve eso, y lo hace como plataforma multiempresa: Restavor es el primer espacio de
mantenimiento, pero otros proveedores podrán tener el suyo.

Cuotly debe responder en todo momento a dos preguntas, y toda decisión de diseño se juzga por ellas:

1. **¿Qué está pasando ahora?**
2. **¿Qué necesita atención o una decisión?**

### 1.1 Objetivos de la Fase 1

- Que Restavor pueda operar su mantenimiento real íntegramente en Cuotly, sin hojas de cálculo.
- Que la cadena solicitud → trabajo → publicación sea trazable de punta a punta.
- Que los plazos contractuales se midan solos, en servidor, y avisen antes de incumplirse.
- Que el consumo del plan sea exacto, auditable e imposible de duplicar.
- Que el aislamiento entre espacios sea real desde el primer día, aunque solo exista Restavor.

### 1.2 No objetivos de la Fase 1

Menú Diario completo, integraciones analíticas, oportunidades, informes de rendimiento digital,
aplicación móvil nativa, panel de administración de la plataforma y facturación de suscripciones
Pro/Agency. Todo eso está planificado en `ROADMAP.md` y **la Fase 1 debe dejar el modelo de datos
preparado para ello**, pero no se implementa ahora.

---

## 2. Principios de producto

| # | Principio | Consecuencia práctica |
|---|---|---|
| P1 | Claridad antes que densidad | Ningún gráfico o métrica que no ayude a decidir algo. |
| P2 | Separación estricta de contextos | La interfaz indica siempre en qué espacio y establecimiento estás. |
| P3 | Permisos antes que ocultación visual | Todo se valida en servidor y en RLS. |
| P4 | Historial antes que sobrescritura | Versiones y auditoría; nunca se pierde el valor anterior. |
| P5 | Automatización con control humano | La IA propone; una persona autorizada valida antes de que el cliente lo vea. |
| P6 | No inventar datos | Se distingue dato medido, dato manual, estimación y dato no disponible. |
| P7 | El cliente no ve la organización interna | Toda comunicación del equipo aparece como "Equipo de mantenimiento". |

---

## 3. Glosario

Estos términos tienen un significado exacto. Se usan igual en el código (en inglés), en la interfaz,
en los correos y en el historial. **Nunca se usan como sinónimos.**

| Término (UI, español) | Código (inglés) | Definición |
|---|---|---|
| Plataforma | platform | Cuotly en su conjunto. Su propietario es Bosco. |
| Espacio de mantenimiento | space | Un proveedor de mantenimiento (Restavor es uno). Unidad de aislamiento de datos. |
| Grupo | group | Empresa o grupo cliente. Contiene establecimientos. |
| Establecimiento | establishment | Un restaurante concreto. Tiene plan, consumos, pagos y trabajos propios. |
| Plan de mantenimiento | plan | Producto que el espacio vende a un establecimiento (Básico, Impulso, Premium). |
| Servicio | service | Producto adicional con sus propias reglas y consumos (Menú Diario). |
| Suscripción del establecimiento | subscription | Contrato vigente de un establecimiento con un plan o un servicio. |
| Ciclo de consumo | consumption_cycle | Periodo mensual de una suscripción; define qué bolsa de consumos aplica. |
| Solicitud | request | Petición del restaurante. Aún puede necesitar análisis, información o aceptación. |
| Trabajo | job | Unidad operativa. **Solo existe tras la aceptación válida del cliente.** |
| Tarea | task | Paso interno de un trabajo, o actividad interna independiente. |
| Cambio | change | Unidad de consumo del plan, con categoría: pequeño, fotográfico, mediano o grande. |
| Consumo | consumption entry | Apunte en el libro inmutable que descuenta o devuelve una unidad de una categoría. |
| Corrección mínima | free correction | Un único microajuste gratuito por trabajo. |
| Puntos de carga | load points | Medida de trabajo humano activo. **No es consumo ni productividad.** |
| Supervisión | supervision | Relación entre un Administrador y un Trabajador. No es un rol. |
| Reloj contractual | business clock | Calendario laborable sobre el que se miden todos los plazos. |

---

## 4. Usuarios y roles

### 4.1 Roles de plataforma

- **Propietario de Cuotly** (Bosco): control global. Se identifica por el correo de la variable de entorno `CUOTLY_OWNER_EMAIL`. Aprueba espacios, entra en Modo soporte, ve métricas globales.
- **Administrador de Cuotly**: rol futuro, configurable por permisos. En Fase 1 **solo existe en el modelo de datos**, sin interfaz.

### 4.2 Roles del espacio de mantenimiento

- **Propietario del espacio**: control total. Es el **único** que invita trabajadores, nombra o retira administradores, asigna supervisores, crea o modifica planes, cambia configuración contractual y puede transferir, archivar o solicitar eliminar el espacio. Puede ejecutar trabajos solo como recurso operativo cuando no hay nadie más disponible.
- **Administrador de mantenimiento**: gestiona operación, restaurantes, solicitudes, trabajos, tareas, finanzas e informes. Puede ejecutar trabajos si tiene la capacidad `perform_jobs`. No toca configuración contractual.
- **Trabajador**: acceso operativo limitado a los establecimientos, trabajos y tareas autorizados. No ve finanzas globales, credenciales ni configuración sensible. Puede marcar un cobro como pagado desde la ficha de un restaurante asignado, sin entrar en Finanzas. Puede pedir reasignación y declarar disponibilidad. Conserva acceso de lectura al historial operativo de los establecimientos que siga teniendo autorizados.

### 4.3 Roles de cliente

- **Propietario global del grupo**: todos los establecimientos del grupo, actuales y futuros. Puede haber varios.
- **Propietario local**: solo su establecimiento.
- **Editor**: los establecimientos que le asignen. Ve informes siempre. Puede recibir permisos específicos `edit_establishment_data` y `view_billing`. Puede invitar a Editor o Consulta dentro de sus establecimientos, sin conceder propiedad y sin poder eliminar al último propietario.
- **Consulta**: solo lectura. No responde mensajes. No ve facturación. Necesita permiso de su propietario para ver informes.

### 4.4 Supervisión (RN-SUP)

- **RN-SUP-01**: la supervisión es una relación entre un Administrador (principal) y un Trabajador, no un rol.
- **RN-SUP-02**: cada trabajador tiene exactamente un Administrador principal.
- **RN-SUP-03**: puede existir un sustituto temporal con fecha de inicio y fin, que puede retirarse antes o ampliarse.
- **RN-SUP-04**: principal y sustituto reciben ambos los avisos que correspondan mientras la sustitución esté vigente.
- **RN-SUP-05**: solo el propietario del espacio crea o cambia relaciones de supervisión.
- **RN-SUP-06**: al nombrar un administrador, la interfaz ofrece "Asignar trabajador" o "Continuar sin trabajador". Un administrador puede existir sin supervisados.

### 4.5 Estados de miembro interno

`invited` · `active` · `temporarily_absent` · `inactive` · `access_revoked`

Al pasar a `inactive` o `access_revoked`: pierde acceso de inmediato, deja de recibir asignaciones y
notificaciones, el sistema marca sus trabajos pendientes como necesitados de reasignación y **se conserva
todo su historial**.

### 4.6 Especialidades

`web` · `design` · `copy` · `seo` · `daily_menu` · `analytics` · `general`
Un trabajador puede tener varias. `general` habilita cualquier categoría sin impedir registrar
especialidades concretas además.

---

## 5. Modelo de datos

### 5.1 Reglas estructurales (obligatorias)

- **RN-DAT-01**: identificadores internos `uuid`. Además, código humano donde aporte valor: establecimientos `EST-0001`, solicitudes `SOL-0001`, trabajos `TRB-0001`, correlativos **por espacio**.
- **RN-DAT-02**: toda entidad perteneciente a un espacio lleva `space_id NOT NULL`. Toda entidad específica de un restaurante lleva además `establishment_id`.
- **RN-DAT-03**: RLS activado en **todas** las tablas, con políticas explícitas. Sin excepciones.
- **RN-DAT-04**: consumos y finanzas se registran mediante **libro inmutable de apuntes** (`consumption_entries`, `financial_entries`), nunca con un número editable. Los saldos son suma de apuntes.
- **RN-DAT-05**: los estados derivados (por ejemplo "Fuera de plazo") se calculan a partir de eventos, no se almacenan como estado.
- **RN-DAT-06**: borrado lógico o archivado antes que eliminación física.
- **RN-DAT-07**: versionado para planes, servicios, solicitudes, mensajes editados, menús, informes y archivos.
- **RN-DAT-08**: `timestamptz` en todas las fechas y zona horaria explícita del espacio en los cálculos.
- **RN-DAT-09**: las operaciones críticas se ejecutan dentro de una transacción y aceptan una `idempotency_key`.

### 5.2 Entidades de la Fase 1

**Plataforma**
`users` · `profiles` · `spaces` · `space_memberships` · `space_invitations` · `platform_roles` · `support_sessions` · `audit_log`

**Clientes**
`groups` · `establishments` · `group_memberships` · `establishment_memberships` · `establishment_permissions`

**Comercial**
`plans` · `plan_versions` · `services` · `service_versions` · `subscriptions` · `consumption_cycles` · `consumption_entries` · `quotes`(estructura, sin flujo completo) · `acceptances`

**Operación**
`requests` · `request_versions` · `classifications` · `jobs` · `tasks` · `assignments` · `supervisions` · `state_events` · `timer_events` · `blocks` · `corrections`

**Comunicación y archivos**
`conversations` · `conversation_participants` · `messages` · `message_edits` · `internal_notes` · `files` · `file_versions` · `file_links`

**Finanzas**
`charges` · `payments` · `payment_confirmations` · `receipts` · `financial_entries`

**Sistema**
`notifications` · `notification_preferences` · `calendar_events` · `holidays` · `space_working_hours` · `ai_usage`

> Las entidades de Menú Diario, integraciones, métricas, informes y oportunidades se crean en sus fases.
> No las adelantes, pero no diseñes nada que impida añadirlas.

### 5.3 Entidades preparadas pero no explotadas en Fase 1

`platform_roles` (Administrador de Cuotly), `quotes` (presupuestos), `ai_usage` (medición del consumo
de IA por espacio, que según el modelo comercial se facturará aparte al propietario del espacio).

---

## 6. Modelo comercial (RN-COM)

### 6.1 Planes de mantenimiento de Restavor

Todos los precios son **más IVA** (Restavor: 21 %).

| Plan | Precio/mes | Pequeños | Fotográficos | Medianos | Grandes | Plazo de inicio |
|---|---:|---:|---:|---:|---:|---:|
| Básico | 99 € | 0 | 0 | 0 | 0 | 48 h laborables |
| Impulso | 399 € | 16 | 12 | 3 | 0 | 24 h laborables |
| Premium | 599 € | 25 | 24 | 5 | 1 | 24 h laborables |

- **RN-COM-01**: en Básico **cualquier** modificación se presupuesta aparte. No hay consumos incluidos.
- **RN-COM-02**: Impulso no incluye cambios grandes; se presupuestan aparte.
- **RN-COM-03**: Premium tiene prioridad interna superior a Impulso. **El cliente nunca ve esa prioridad.**
- **RN-COM-04**: facturación mensual. Permanencia mínima inicial de 3 meses; después, renovación mensual automática.
- **RN-COM-05**: un cambio voluntario de plan inicia una nueva permanencia de 3 meses.
- **RN-COM-06**: los consumos se renuevan en la fecha de renovación del establecimiento y **no se acumulan**.
- **RN-COM-07**: no existen bolsas de horas. Los trabajos fuera de plan se presupuestan aparte y no consumen bolsa.

### 6.2 Servicio Menú Diario

- **RN-COM-08**: 229 € + IVA al mes; 199 € + IVA si el establecimiento tiene plan Premium activo.
- **RN-COM-09**: 30 actualizaciones por ciclo mensual, no acumulables. Permanencia mínima de 3 meses.
- **RN-COM-10**: tres plantillas personalizadas iniciales incluidas una sola vez. Sustituciones y rediseños se presupuestan aparte.

### 6.3 Composición contractual de un establecimiento (enmienda 29/08/2026)

- **RN-COM-11**: un establecimiento puede tener **un plan de mantenimiento, el servicio Menú Diario, o ambos**. El plan de mantenimiento es opcional. *(Enmienda a §105 de la especificación maestra.)*
- **RN-COM-12**: un establecimiento **sin** plan de mantenimiento y **con** Menú Diario puede crear solicitudes de cambio en su web. Se comportan como en Básico: sin consumos incluidos, todo a presupuesto, primera atención de 48 h laborables.
- **RN-COM-13**: como máximo un plan de mantenimiento activo a la vez. Los servicios adicionales pueden ser varios.
- **RN-COM-14**: no se permiten precios negociados individuales para los planes de Restavor.

### 6.4 Cambio de plan

- **RN-COM-15 (mejora inmediata)**: se cobra la diferencia económica proporcional al periodo restante, **redondeada a 2 decimales**. Se añaden consumos adicionales proporcionales al periodo restante, **redondeando al alza** (a favor del cliente). No se duplica lo ya utilizado. El nuevo plazo de inicio se aplica solo a solicitudes posteriores al cambio. Nueva permanencia de 3 meses.
- **RN-COM-16 (mejora en renovación)**: nuevo plan y bolsa completa en la fecha de renovación. Nueva permanencia de 3 meses.
- **RN-COM-17 (reducción)**: solo en renovación y solo tras cumplir la permanencia vigente. Sin reembolso. Los consumos sobrantes desaparecen. Nueva permanencia de 3 meses. Los trabajos ya aceptados conservan las condiciones con las que se aceptaron.

**Fórmula de prorrateo (RN-COM-18)**
```
fracción_restante = minutos_naturales_restantes_del_ciclo / minutos_naturales_totales_del_ciclo
importe_diferencia = redondear2( (precio_nuevo - precio_antiguo) * fracción_restante )
unidades_extra(cat) = techo( (incluidas_nuevo(cat) - incluidas_antiguo(cat)) * fracción_restante )
```
Si `unidades_extra` sale negativo se trata como 0: una mejora nunca quita consumos.

---

## 7. Reloj contractual (RN-CLK)

Este es el componente más delicado del sistema. Vive en `src/core/business-clock.ts`, es lógica pura y
tiene tests exhaustivos.

- **RN-CLK-01**: la ventana laborable va de **lunes 09:00 a sábado 14:30**, de forma **continua**, incluidas las noches entre semana.
- **RN-CLK-02**: el reloj se pausa desde el sábado a las 14:30 hasta el lunes a las 09:00.
- **RN-CLK-03**: el reloj se pausa los días festivos configurados para el espacio, el día completo (00:00–24:00 en la zona horaria del espacio).
- **RN-CLK-04**: la unidad de cálculo es el **minuto laborable**.
- **RN-CLK-05**: una semana sin festivos contiene 125,5 h laborables (lunes 15 h + martes a viernes 24 h + sábado 14,5 h).
- **RN-CLK-06**: la zona horaria es la del **espacio** (Restavor: `Europe/Madrid`), con cambio de horario de verano/invierno automático.
- **RN-CLK-07**: la disponibilidad personal de un trabajador **no modifica** este reloj.
- **RN-CLK-08**: el horario humano de soporte (§132 de la especificación maestra) es un reloj **distinto** y no afecta a ningún plazo contractual.
- **RN-CLK-09**: Menú Diario usa un **tercer** calendario: todos los días del año, festivos incluidos. *(Enmienda 29/08/2026.)*
- **RN-CLK-10**: los calendarios laborales se versionan. Un cambio de festivos **no** recalcula retroactivamente contadores ya en curso, salvo corrección manual auditada.

**Interfaz mínima del módulo**
```ts
businessMinutesBetween(from: Date, to: Date, calendar: WorkCalendar): number
addBusinessMinutes(from: Date, minutes: number, calendar: WorkCalendar): Date
isWithinBusinessWindow(at: Date, calendar: WorkCalendar): boolean
```

**Ejemplos que deben pasar como tests**
- Una petición del sábado a las 14:00 consume 30 minutos laborables y continúa el lunes a las 09:00.
- Una petición del sábado a las 18:00 o del domingo empieza a contar el lunes a las 09:00.
- 24 h laborables desde el viernes a las 10:00 → sábado 14:30 aporta 4,5 h y el resto continúa el lunes.
- Un festivo en martes descuenta 24 h laborables del cómputo.

---

## 8. Los tres contadores (RN-SLA)

**Nunca se mezclan.** Son tres relojes distintos con arranques, pausas y paradas propios.

### T1 — Primera atención interna
- **RN-SLA-01**: arranca cuando la solicitud se envía y entra en el espacio (estado `received`).
- **RN-SLA-02**: duración = 48 h laborables (Básico o establecimiento sin plan) / 24 h laborables (Impulso y Premium).
- **RN-SLA-03**: se detiene cuando la solicitud pasa a `pending_client_acceptance`, `needs_information` o `rejected`.
- **RN-SLA-04**: reciben aviso el propietario y **todos** los administradores. Un trabajador solo recibe aviso cuando ya existe una asignación válida.

### T2 — Inicio operativo
- **RN-SLA-05**: arranca cuando, tras la aceptación válida del cliente, el trabajo queda **asignado**.
- **RN-SLA-06**: duración = la misma que T1 según el plan (48 h / 24 h).
- **RN-SLA-07**: se detiene cuando el responsable pulsa **Comenzar**.
- **RN-SLA-08**: si durante la validación cambia la clasificación, el alcance o el consumo, el cliente vuelve a aceptar y **T2 se reinicia desde cero**. La solicitud conserva todos los intentos anteriores.
- **RN-SLA-09**: una **reasignación NO reinicia T2**. El nuevo responsable recibe el tiempo restante exacto.
- **RN-SLA-10**: avisos al 50 %, 80 % y 100 % del plazo. Además: alerta importante a responsable, supervisor y propietario cuando quedan **2 h laborables**; sugerencia de reasignación cuando queda **1 h**; al vencer, exige intervención explícita.

### T3 — Ejecución
- **RN-SLA-11**: arranca al pulsar **Comenzar**.
- **RN-SLA-12**: duración por categoría:

| Categoría | Rango mostrado al cliente | Máximo operativo interno |
|---|---|---:|
| Pequeño | 1–3 días laborables | 72 h laborables |
| Fotográfico | 1–3 días laborables | 72 h laborables |
| Mediano | 1–3 días laborables | 72 h laborables |
| Grande | 3–5 días laborables | 120 h laborables |

- **RN-SLA-13**: se detiene al publicar.
- **RN-SLA-14**: se **pausa** durante bloqueos y pausas autorizadas, conservando el tiempo restante exacto.
- **RN-SLA-15**: avisos al 75 %, 90 % y 100 %.
- **RN-SLA-16**: el cliente ve rangos o fechas aproximadas. Propietario, administradores y responsable ven el contador exacto.
- **RN-SLA-17**: "Fuera de plazo" es una **condición calculada**, no un estado. Puede coexistir con En curso, Bloqueado o cualquier otro.

**Implementación**: cada arranque, pausa, reanudación y parada se registra como fila en `timer_events`.
El tiempo consumido se recalcula sumando eventos, nunca guardando un contador mutable.

---

## 9. Solicitudes (RN-REQ)

### 9.1 Flujo base
1. El restaurante crea un borrador y añade descripción, contexto y archivos.
2. Envía. Arranca T1.
3. Cuotly analiza y **propone** clasificación y consumo (ver §10).
4. Propietario o administrador **confirma o corrige** la clasificación y el consumo.
5. Si falta información, se solicita al cliente.
6. El restaurante recibe la propuesta final.
7. El restaurante **acepta**.
8. Se registra el consumo o se aplica el presupuesto.
9. Se crea el **trabajo**.
10. Se asigna, o queda pendiente de asignación. Arranca T2.

### 9.2 Estados
`draft` · `received` · `analyzing` · `needs_information` · `pending_internal_validation` ·
`pending_client_acceptance` · `accepted` · `in_progress` · `published` · `correction_requested` ·
`in_correction` · `closed` · `cancelled_before_start` · `cancelled_after_start` · `rejected`

- **RN-REQ-01**: las etiquetas visibles pueden ser más amables que el nombre interno, pero el mapeo es 1 a 1 y **el mismo nombre visible se usa en web, correo, PDF e historial**.
- **RN-REQ-02**: un trabajo **solo** puede crearse desde una solicitud en estado `accepted`.
- **RN-REQ-03**: el equipo puede **rechazar** una petición imposible, no prestada o fuera de servicio. Se explica el motivo al cliente, **no consume cambios**, queda en historial y puede ofrecerse alternativa o presupuesto.
- **RN-REQ-04 (copiar/pegar)**: "Copiar solicitud" y "Pegar solicitud" funcionan **solo dentro del mismo grupo**. Copiar no crea nada por sí solo; al pegar se crea un **borrador** para el establecimiento destino, se vuelve a analizar el contenido, el consumo pertenece al destino y los adjuntos copiados se muestran para revisión sin enviarse automáticamente.

---

## 10. Clasificación y uso de IA (RN-CLS)

### 10.1 Categorías de cambio

- **Pequeño**: nombre, frase, precio, título, contacto, enlace, un día de horario, media o número de reseñas, logo ya entregado, texto ya redactado por el cliente.
- **Fotográfico**: subir o sustituir una fotografía entregada por el cliente y el retoque básico para que quede correctamente colocada. **No incluye** producción fotográfica, retoque avanzado, reconstrucciones ni compra de derechos.
- **Mediano**: modificar una sección de la carta, añadir unos cinco platos, texto largo de Historia o Inicio, horario completo, reseña destacada, botón de delivery correctamente integrado.
- **Grande**: carta completa, contenido amplio de una sección, menú especial con diseño, modificación amplia de reseñas, sección nueva importante como Eventos.

### 10.2 Reglas

- **RN-CLS-01**: al enviarse una solicitud, Cuotly llama a la API de Anthropic desde el **servidor** para proponer categoría, consumo y un resumen del alcance. La clave vive en variables de entorno y **nunca** se expone al cliente.
- **RN-CLS-02**: si la API falla, tarda demasiado o no hay clave configurada, el sistema **cae automáticamente** a un motor de reglas por palabras clave y lo indica en la propuesta. El flujo nunca se bloquea por la IA.
- **RN-CLS-03**: la propuesta de la IA es **siempre** una propuesta. Propietario o administrador la valida o corrige antes de que el cliente la vea. La IA nunca cierra una clasificación por sí sola.
- **RN-CLS-04**: se guarda qué propuso la IA, qué decidió la persona y quién fue, para poder medir la calidad de la clasificación y calibrarla después.
- **RN-CLS-05**: cada llamada registra un apunte en `ai_usage` con espacio, tokens y coste estimado. La IA se factura aparte al propietario del espacio, aunque en Fase 1 solo se mida.
- **RN-CLS-06**: la IA se usa **exclusivamente** para clasificar solicitudes y reanalizar solicitudes pegadas. Las oportunidades y los informes son deterministas y no la usan.
- **RN-CLS-07**: el **Agente Cuotly** no existe todavía. Solo la entrada de menú con la etiqueta "Próximamente", que al pulsarse informa de que aún no está disponible. Sin funcionalidad simulada.

### 10.3 Aceptación y consumo

- **RN-CLS-08**: el consumo se registra en el momento de la **aceptación del cliente**, no antes.
- **RN-CLS-09**: si una corrección interna cambia el consumo, se solicita **nueva aceptación** y T2 se reinicia desde cero. Todo el historial anterior se conserva.

---

## 11. Trabajos y tareas (RN-JOB)

### 11.1 Estados de trabajo
`pending_assignment` · `assigned` · `reassignment_requested` · `in_progress` · `blocked_by_client` ·
`authorized_pause` · `published` · `in_correction` · `completed` · `cancelled_before_start` · `cancelled_after_start`

### 11.2 Estados de tarea
`pending` · `in_progress` · `blocked` · `completed` · `cancelled`

- **RN-JOB-01**: el trabajador **no puede cancelar** una tarea; debe pedírselo a un administrador.
- **RN-JOB-02**: las tareas son opcionales en trabajos pequeños y recomendables u obligatorias en trabajos grandes.

### 11.3 Comenzar

- **RN-JOB-03**: una vez asignado, el responsable debe pulsar **Comenzar** dentro del plazo T2.
- **RN-JOB-04**: **antes** de pulsar Comenzar, si el cliente cancela, el consumo se devuelve. **Después** de Comenzar, la cancelación mantiene el consumo.
- **RN-JOB-05**: un cambio incluido en el plan es una obligación contractual del espacio. El trabajador **no puede rechazarlo** por preferencia personal; si hay un impedimento real, lo escala internamente.
- **RN-JOB-06**: un trabajo presupuestado aparte puede requerir una aceptación operativa específica.

### 11.4 Bloqueos y pausas

- **RN-JOB-07**: razones válidas: falta información del cliente, incidente externo grave, pausa autorizada por el propietario, pausa financiera por impago.
- **RN-JOB-08**: al faltar información, el estado visible es `Bloqueado · Esperando al restaurante`, T3 se pausa y se conserva el tiempo restante, que se reanuda al recibir lo necesario.
- **RN-JOB-09**: el trabajador puede marcar un bloqueo por cliente. El administrador recibe aviso y puede revertirlo, quedando registrado en auditoría.

### 11.5 Publicación

- **RN-JOB-10**: el trabajador publica directamente al terminar. **No necesita aprobación previa del supervisor.**
- **RN-JOB-11**: el supervisor recibe una notificación posterior y puede revisar lo publicado.
- **RN-JOB-12**: un error imputable al equipo se corrige **sin consumir** cambios ni la corrección mínima del cliente.

### 11.6 Finalizados (enmienda 29/08/2026)

- **RN-JOB-13**: los trabajos y tareas finalizados permanecen **30 días naturales** en la columna "Finalizados" de las vistas operativas. Pasados los 30 días dejan de mostrarse ahí y quedan accesibles en el historial. No se borra nada.

---

## 12. Consumos (RN-CON)

- **RN-CON-01**: cada cambio consume **una unidad de su categoría**. Los puntos de carga no intervienen en el consumo.
- **RN-CON-02**: Menú Diario usa un contador de **actualizaciones** separado del de cambios.
- **RN-CON-03**: un trabajo presupuestado aparte **no consume** la bolsa del plan.
- **RN-CON-04**: los consumos devueltos, corregidos o compensatorios se auditan con motivo y actor.
- **RN-CON-05**: una renovación **no modifica** el periodo al que pertenece un consumo ya aceptado.
- **RN-CON-06**: **solo una** solicitud puede consumir el último crédito disponible. Se garantiza con transacción y bloqueo de fila sobre el ciclo.
- **RN-CON-07**: pulsar dos veces aceptar, publicar, pagar o completar **nunca** duplica el efecto ni la notificación.

### 12.1 Cancelaciones y devolución

- **RN-CON-08**: antes de pulsar Comenzar → se devuelve el consumo.
- **RN-CON-09**: después de Comenzar → se mantiene el consumo.
- **RN-CON-10**: si el ciclo original ya terminó, la devolución **no** revive ese ciclo: crea un **crédito compensatorio** de la misma categoría en el ciclo actual.
- **RN-CON-11**: el crédito compensatorio caduca con el ciclo en el que se creó, como cualquier otro consumo.
- **RN-CON-12**: toda devolución conserva motivo y trazabilidad completa.

---

## 13. Corrección mínima gratuita (RN-COR)

> **1 cambio realizado → 1 corrección mínima gratuita sobre ese mismo cambio → 0 créditos adicionales.**

- **RN-COR-01**: una sola corrección en total por trabajo.
- **RN-COR-02**: puede usarse durante la ejecución o durante las **72 h laborables** posteriores a la publicación. Si se usa durante la ejecución, no vuelve a estar disponible después.
- **RN-COR-03**: sirve solo para un microajuste **del mismo alcance**: corregir una palabra o errata, ajustar mínimamente un texto ya cambiado, corregir la colocación básica de una fotografía, corregir un precio dentro del mismo cambio.
- **RN-COR-04**: **no** incluye añadir contenido nuevo, cambiar otra sección, sustituir otra fotografía, rehacer el trabajo por cambio de idea, ampliar el alcance ni una segunda corrección.
- **RN-COR-05**: se aplica también a los trabajos presupuestados aparte.
- **RN-COR-06**: la realiza preferentemente el mismo trabajador, si está disponible.
- **RN-COR-07**: los errores imputables al equipo se corrigen **sin** consumir esta corrección ni créditos.
- **RN-COR-08**: al terminar la ventana de corrección, la conversación de esa solicitud pasa a **solo lectura**. Una necesidad nueva exige una solicitud nueva.
- **RN-COR-09**: no hay recordatorio automático de expiración de la corrección.
- **RN-COR-10 (Menú Diario, enmienda 29/08/2026)**: la corrección mínima también existe en Menú Diario, pero **no se garantiza su ejecución** si la edición o la petición de cambio llega después de las 21:00 del día anterior.

---

## 14. Asignación, carga y disponibilidad (RN-ASG)

### 14.1 Asignación

- **RN-ASG-01**: un trabajador puede estar asignado a uno, varios o todos los establecimientos, autorizado por especialidad o mediante `general`.
- **RN-ASG-02**: solo participan en recomendaciones los trabajadores **activos y válidos**.
- **RN-ASG-03**: si existe **exactamente un** trabajador activo, disponible, con la especialidad adecuada y asignado a ese restaurante, Cuotly lo asigna **automáticamente**.
- **RN-ASG-04**: si hay varios válidos, Cuotly **recomienda** uno y el propietario acepta o elige otro.
- **RN-ASG-05**: si no hay ninguno válido, el trabajo queda en `pending_assignment`, se avisa al propietario y a **todos** los administradores, y las alertas crecen mientras nadie lo asuma.

**RN-ASG-06 — Orden de candidatos.** La fórmula ponderada definitiva está **pendiente de calibración** y
**no debe inventarse**. En Fase 1 el orden es determinista y lexicográfico:

*Filtros duros (excluyen):* capacidad de realizar el trabajo → asignado al establecimiento → estado activo → especialidad compatible → disponibilidad declarada.
*Desempate, en este orden:* menor carga actual en puntos → menor número de trabajos activos → menos plazos próximos a vencer → mayor tiempo desde su última asignación (reparto equilibrado).

La función vive aislada en `src/core/assignment.ts` con una tabla `assignment_weights` preparada y
vacía, para poder sustituir el orden por una fórmula ponderada cuando se calibre.

### 14.2 Reasignación

- **RN-ASG-07**: el trabajador puede solicitarla explicando el motivo.
- **RN-ASG-08**: la aprueba el propietario o el administrador principal correspondiente.
- **RN-ASG-09**: se conserva todo el historial, **el contador no se reinicia** y el nuevo responsable recibe el tiempo restante exacto.

### 14.3 Disponibilidad

- **RN-ASG-10**: no existe horario fijo obligatorio por trabajador; cada uno declara disponibilidad variable.
- **RN-ASG-11**: la disponibilidad sirve para planificación y recomendación, y **no modifica el SLA del cliente**.
- **RN-ASG-12**: una ausencia aprobada marca automáticamente al trabajador como no disponible y, si deja trabajos sin cobertura, se avisa para reasignar.

### 14.4 Puntos de carga

Miden **trabajo humano activo**. No son consumo del plan ni una nota de productividad.

| Trabajo | Puntos | | Tarea | Duración | Puntos |
|---|---:|---|---|---|---:|
| Fotográfico | 1 | | Ligera | hasta 15 min | 1 |
| Pequeño | 1 | | Normal | 15–45 min | 3 |
| Mediano | 4 | | Alta | 45–120 min | 6 |
| Grande | 10 | | Muy alta | 2–4 h | 10 |

| Puntos activos | Nivel |
|---|---|
| 0–9 | Baja |
| 10–19 | Normal |
| 20–29 | Alta |
| 30 o más | Muy alta |

- **RN-ASG-13**: suman los trabajos `assigned` (aún sin comenzar) y `in_progress`, y las tareas asignadas. Al completarse dejan de sumar, pero permanecen en métricas e historial.
- **RN-ASG-14**: si un trabajo **no** está desglosado en tareas, el responsable recibe los puntos completos del cambio. Si **sí** está desglosado entre varias personas, los puntos generales del trabajo dejan de sumar y cada participante recibe los de sus tareas. El trabajo conserva su categoría original.
- **RN-ASG-15**: no existe un máximo duro. El sistema avisa y recomienda, pero una persona autorizada puede asignar manualmente por encima del nivel.
- **RN-ASG-16**: la categoría de puntos para tareas de **más de 4 horas está pendiente**. Estas tareas deben dividirse. **No inventes una categoría nueva.**
- **RN-ASG-17**: las comparaciones de desempeño solo las ven propietario y administradores, se segmentan por plan, tipo de cambio, volumen, dificultad, cumplimiento de plazos, correcciones atribuibles y periodo comparable. **No existe ranking público entre trabajadores.**

---

## 15. Grupos y establecimientos (RN-EST)

- **RN-EST-01**: jerarquía `Grupo → Establecimientos`. Un grupo puede tener uno o varios establecimientos y varios propietarios globales. Una cuenta puede pertenecer a varios grupos.
- **RN-EST-02**: solo propietario y administradores del espacio crean establecimientos.
- **RN-EST-03**: los propietarios globales reciben acceso **automático** a los establecimientos nuevos del grupo.
- **RN-EST-04**: un Editor puede asignarse a uno, varios, todos los actuales, o todos los actuales **y futuros**.
- **RN-EST-05**: al retirar un acceso desaparece de inmediato, pero la actividad histórica permanece.
- **RN-EST-06**: cada establecimiento recibe un código automático correlativo por espacio (`EST-0048`). No tiene por qué ser prominente para el cliente.
- **RN-EST-07**: un establecimiento solo puede estar activo en **un** espacio de mantenimiento a la vez.

### 15.1 Estados del establecimiento

`configuring` · `active` · `paused` · `ending` · `read_only` · `suspended` · `archived`

- **RN-EST-08**: en `paused` se puede consultar, pero **no** crear solicitudes ni menús. El motivo concreto (por ejemplo, impago) se muestra junto al estado.
- **RN-EST-09 (`ending`, enmienda 29/08/2026)**: el restaurante ha comunicado la baja pero el servicio sigue activo hasta el final del periodo pagado o de la permanencia vigente. Al llegar esa fecha pasa a `read_only` durante 24 h y después a `suspended`.
- **RN-EST-10**: al terminar el mantenimiento por causa distinta al ciclo de impago, el cliente dispone de 24 h en solo lectura; después el establecimiento queda suspendido. Los datos **no se eliminan automáticamente**.

### 15.2 Ficha del establecimiento

Datos mínimos: nombre comercial, razón social, identificación fiscal, dirección, teléfonos, correos y
contactos, sitio web, dominio, horarios, plan y servicios, responsables, plataformas externas utilizadas,
datos financieros operativos, notas internas y archivos principales.

- **RN-EST-11**: el propietario puede editar contacto y datos fiscales; los Editores solo con el permiso `edit_establishment_data`.
- **RN-EST-12**: cambiar datos en la ficha de Cuotly **no** cambia el contenido público de la web. Eso requiere una solicitud.
- **RN-EST-13**: las notas internas las ven propietario y administradores en su totalidad; los trabajadores solo las notas operativas de sus establecimientos autorizados; **los clientes nunca**.

La ficha tiene cinco pestañas: **Resumen · Operación · Informes y datos · Gestión · Historial**.
En Fase 1, "Informes y datos" muestra únicamente indicadores operativos propios; la analítica digital
llega en la Fase 3.

---

## 16. Mensajes (RN-MSG)

Tres tipos de conversación: **de solicitud**, **interna de trabajo** y **general del establecimiento**.

- **RN-MSG-01**: **no existen chats privados entre cliente y trabajador**.
- **RN-MSG-02**: el cliente siempre ve "Equipo de mantenimiento" como interlocutor.
- **RN-MSG-03**: propietario y administradores ven todas las conversaciones del espacio; el trabajador solo las de establecimientos y trabajos autorizados.
- **RN-MSG-04**: las notas internas están **estrictamente separadas** de los mensajes con el cliente. Un fallo aquí es un fallo grave.
- **RN-MSG-05**: el rol Consulta puede leer pero no responder.
- **RN-MSG-06**: se muestran los estados leído y no leído.
- **RN-MSG-07**: un mensaje puede editarse durante **10 minutos**; después aparece la marca `Editado` y se conserva la versión anterior.
- **RN-MSG-08**: los mensajes **no se eliminan nunca**.
- **RN-MSG-09**: adjuntos permitidos: imágenes, PDF, Word, Excel y texto. **No** vídeos ni ejecutables.
- **RN-MSG-10**: "Convertir en solicitud" crea un borrador arrastrando los mensajes y adjuntos relevantes, y antes de enviarlo se revisan alcance, destinatario y archivos.

---

## 17. Finanzas (RN-FIN)

Cuotly es un **control financiero operativo**. No procesa pagos ni sustituye a un sistema contable.

- **RN-FIN-01**: la mensualidad se genera automáticamente en la fecha de renovación según plan, impuestos y condiciones vigentes.
- **RN-FIN-02**: estados de cobro: `pending` · `paid` · `partially_paid` · `overdue` · `waived` · `refunded`.
- **RN-FIN-03** (corregida 31/08/2026): métodos registrados: **transferencia o Bizum**. Sin Stripe ni pasarela, los pagos se registran a mano, así que no hay tarjeta ni domiciliación. La redacción anterior listaba cinco métodos y contradecía a CLAUDE.md y a la Especificación Maestra; resuelto por Bosco (decisión 10 de `docs/DECISIONES.md`).
- **RN-FIN-04**: propietario y administradores confirman, corrigen y gestionan cobros.
- **RN-FIN-05**: un **trabajador** puede marcar "Pagado" desde la ficha de un restaurante asignado sin acceder al módulo Finanzas. Indica fecha, importe y método, y puede adjuntar justificante. **No** puede cambiar precios, perdonar deuda, reembolsar ni ver ingresos globales. Su acción queda auditada.
- **RN-FIN-06**: el restaurante puede subir un justificante, pero la confirmación siempre corresponde al equipo.
- **RN-FIN-07**: visibilidad: propietario global ve el grupo completo; propietario local, su establecimiento; Editor solo con el permiso `view_billing`; Consulta, nada.
- **RN-FIN-08**: se muestran base imponible, impuesto y total. Restavor usa IVA 21 %; otros espacios configuran el suyo.
- **RN-FIN-09**: en Fase 1 Cuotly **no emite facturas**: permite adjuntar la factura oficial emitida externamente para su descarga. La numeración fiscal está en el bloque legal pendiente.

### 17.1 Impago del restaurante

- **RN-FIN-10**: +24 h naturales desde el vencimiento → establecimiento **Pausado por impago**.
- **RN-FIN-11**: +72 h naturales → servicio detenido y establecimiento **Suspendido por impago**.
- **RN-FIN-12**: se detienen trabajos, publicaciones y contadores. **No se borra información.**
- **RN-FIN-13**: al confirmarse el pago, se reactiva y los contadores continúan **exactamente** donde se pausaron, sin duplicar solicitudes ni trabajos. La reactivación y el pago quedan registrados.
- **RN-FIN-14 (enmienda 29/08/2026)**: la suspensión por impago **no cancela el compromiso**. La deuda se mantiene y, para causar baja, el establecimiento debe abonar las mensualidades restantes de su permanencia.

### 17.2 Panel financiero (Fase 1, versión operativa)

Ingresos mensuales previstos · cobrados · pendientes y vencidos · ingreso recurrente mensual ·
ingresos por plan · próximas renovaciones · restaurantes con impago · resumen con y sin IVA.

---

## 18. Notificaciones (RN-NOT)

Canales de Fase 1: **centro dentro de Cuotly** y **correo electrónico** (Resend). El push llega con la
app móvil (Fase 4). WhatsApp existe solo como **botón de acción manual**, nunca como canal automático.

| Evento | Destinatarios |
|---|---|
| Nueva solicitud sin asignar | Propietario y **todos** los administradores |
| Asignación de un trabajo | Trabajador asignado y sus supervisores (principal y sustituto vigente) |
| Inicio de un trabajo | Visible **dentro** de Cuotly para el cliente, sin correo ni push |
| Publicación | Cliente y supervisión correspondiente |
| Consumo de bolsa | Avisos al 80 % y 100 % |
| T2 plazo de inicio | 50 %, 80 %, 100 %, más alerta a 2 h y sugerencia de reasignación a 1 h |
| T3 ejecución | 75 %, 90 %, 100 % |

- **RN-NOT-01**: **no** se avisa a trabajadores que no estén asignados.
- **RN-NOT-02**: los propietarios reciben todo por defecto y pueden desactivar avisos secundarios.
- **RN-NOT-03**: seguridad, pérdida de acceso, impagos graves y vencimientos críticos **no pueden desactivarse** dentro de Cuotly.
- **RN-NOT-04**: cada aviso lleva un enlace profundo que abre el elemento exacto, cambiando de espacio o establecimiento si hace falta y **verificando el acceso antes**.
- **RN-NOT-05**: los envíos van por cola con reintentos e idempotencia. **El fallo de una notificación nunca revierte la operación principal.**

---

## 19. Archivos (RN-ARC)

- **RN-ARC-01**: categorías: logos, fotografías, menús, textos y documentos, informes, facturación, solicitudes y trabajos, otros.
- **RN-ARC-02**: cada archivo registra nombre, categoría, espacio, grupo, establecimiento, elemento relacionado, usuario, fecha, tamaño y formato.
- **RN-ARC-03**: sustituir un archivo **crea una versión nueva**; la anterior permanece. En fotografía se separan original, retocada y publicada.
- **RN-ARC-04**: cada archivo se marca **Interno** o **Compartido con el restaurante**. Un trabajador puede compartir después uno interno, y queda auditado.
- **RN-ARC-05**: la facturación **nunca** es visible para los trabajadores.
- **RN-ARC-06**: máximo 25 MB por archivo. Imágenes, PDF, Word, Excel y texto. Vídeos no permitidos; ejecutables y formatos peligrosos bloqueados.
- **RN-ARC-07**: los adjuntos de mensajes no se eliminan. El resto se archiva, no se borra. Solo el propietario puede solicitar borrado definitivo, y únicamente si el archivo no está vinculado a operación, factura, aceptación o registro obligatorio.
- **RN-ARC-08**: enlaces privados y temporales para la descarga. Se optimiza la versión visual conservando el original.
- **RN-ARC-09**: almacenamiento incluido: 20 GB en Pro, 100 GB en Agency. Avisos al 80 % y 100 %.

---

## 20. Navegación e interfaz

### 20.1 Selector de contexto
Con un solo contexto accesible se entra directamente. Con varios, aparece un selector con nombre,
logotipo, tipo, rol y alertas rápidas; al pulsar una alerta se abre el elemento exacto tras comprobar
permisos. Bosco **siempre** ve el selector. Existe una acción persistente "Cambiar de espacio".

### 20.2 Menú del espacio (escritorio)
Inicio · Restaurantes · Solicitudes · Trabajos · Tareas · Menú Diario · Mensajes · Calendario ·
Finanzas · Informes · Equipo · Planes y servicios · **Agente Cuotly (Próximamente)** · Ajustes.

En Fase 1, Menú Diario e Informes muestran su estructura con el estado vacío correspondiente.

### 20.3 Navegación móvil (5 destinos + Más)
- Propietario y administrador: Inicio · Solicitudes · Trabajos · Mensajes · Más
- Trabajador: Inicio · Trabajos · Tareas · Mensajes · Más
- Restaurante con Menú Diario: Inicio · Solicitudes · Menú Diario · Mensajes · Más
- Restaurante sin Menú Diario: Inicio · Solicitudes · **+ Nueva solicitud** · Mensajes · Más

### 20.4 Inicio según rol
- **Propietario del espacio**: resumen general, restaurantes y estados, solicitudes y trabajos críticos, carga del equipo, ingresos y pendientes, incidencias, actividad reciente.
- **Administrador**: resumen operativo con prioridad a sus trabajadores supervisados, solicitudes pendientes, trabajos cercanos a vencer, tareas y bloqueos.
- **Trabajador**: "Mi trabajo", trabajo recomendado ahora, cola personal, tareas, bloqueos, mensajes y avisos. **La recomendación no obliga**: puede empezar otro trabajo autorizado.
- **Propietario global de restaurantes**: resumen del grupo, establecimientos, situación financiera consolidada con IVA, solicitudes y trabajos recientes, consumos.

### 20.5 Búsqueda global y acción Crear
Búsqueda desde la cabecera con `Ctrl/Cmd + K` y botón en móvil, sobre grupos, establecimientos,
solicitudes, trabajos, tareas, usuarios, planes, pagos, conversaciones y archivos, por nombre, código,
estado, texto, responsable, plan y fechas. **Nunca devuelve resultados a los que el usuario no tenga
acceso** (el filtrado ocurre en servidor, no en el cliente). Botón global **Crear** cuyas opciones
dependen del contexto y los permisos.

### 20.6 Sistema visual "Emerald Control"

```
Primary Dark   #0B2F2A      Success  #168A6D
Primary        #145C4E      Warning  #D89524
Cuotly Green   #1D8A6A      Danger   #C84C4C
Accent Green   #32B889      Info     #3976D4
Background     #F5F7F4
Surface        #FFFFFF
Soft Surface   #EAF0EC
Main Text      #17211F
Secondary Text #66736E
Border         #DDE5E1
```
Tipografía **Inter**. Un único modo claro. Una única densidad cómoda. Sin selector de tamaño, sin modo
oscuro, sin personalización de colores ni marca blanca. Un espacio puede cambiar su nombre y logotipo,
pero la identidad `Cuotly · by Restavor` se conserva siempre.

### 20.7 Estados de interfaz obligatorios
Cargando · sin datos · error · sin conexión · sin permisos. Autoguardado en formularios largos y
contenido conservado si falla el envío. Confirmaciones descriptivas, nunca "¿Estás seguro?" a secas.
Paginación o carga progresiva en toda lista que pueda crecer.

---

## 21. Requisitos no funcionales

### 21.1 Seguridad
- Aislamiento multiempresa aplicado **en base de datos mediante RLS**, no solo en la interfaz.
- Alojamiento priorizando la Unión Europea. Tráfico cifrado.
- Contraseñas, tokens, códigos y credenciales nunca en texto visible; secretos solo en el servidor.
- 2FA **obligatorio** para el propietario de Cuotly. Recomendado y opcional para propietarios y administradores de espacio. Opcional para trabajadores y clientes.
- Sesiones y dispositivos visibles, con cierre remoto. Avisos por dispositivo nuevo y por cambios sensibles. Límites temporales tras intentos fallidos.
- Las acciones sensibles (roles, permisos, planes, consumos, pagos, SLA, credenciales, propiedad, eliminación) exigen confirmación adicional.
- Modo soporte: motivo obligatorio, identidad visible en auditoría, fecha, hora, duración, acciones realizadas y mínimo privilegio.

### 21.2 Auditoría
Registra al menos: accesos sensibles, roles y permisos, supervisores, asignaciones, consumos, pagos,
plazos, publicaciones, exportaciones, archivos, credenciales, soporte, eliminaciones y correcciones
manuales. **Los registros de auditoría no se editan ni se eliminan desde la aplicación, ni siquiera por
el propietario de la plataforma.**

Visibilidad: el propietario del espacio ve la auditoría completa de su espacio; los administradores, la
operativa; el propietario de un restaurante, la de su establecimiento; trabajadores y Editores, sus
propias acciones y las operaciones autorizadas.

### 21.3 Rendimiento (objetivos internos, no promesas al cliente)
Pantallas habituales por debajo de 2 s. Información principal por debajo de 3 s con conexión móvil
normal. Los procesos pesados muestran progreso y no bloquean la aplicación.

### 21.4 Accesibilidad
WCAG AA como mínimo: contraste suficiente, navegación por teclado, foco visible, etiquetas para
lectores de pantalla, áreas táctiles adecuadas, **estado expresado con texto e icono y no solo con
color**, respeto al zoom y al tamaño de texto del sistema, y reducción de movimiento cuando el sistema
lo solicita.

### 21.5 Idioma y fechas
Español, con la arquitectura preparada para inglés. Lenguaje sencillo para clientes y operativo para el
equipo, sin códigos técnicos visibles. Fechas en la zona del espacio, avisando si el usuario está en
otra zona.

---

## 22. Historias de usuario — Fase 1

Cada historia es atómica y verificable. `HU-xx` identifica la historia.

### Identidad y acceso
- **HU-01** · Como persona, quiero registrarme con correo y contraseña con verificación obligatoria, o con Google, para acceder a Cuotly.
- **HU-02** · Como usuario con varios contextos, quiero un selector al entrar para elegir en cuál trabajo.
- **HU-03** · Como propietario del espacio, quiero invitar a un trabajador por correo, con caducidad de 7 días, para que se una a mi equipo.
- **HU-04** · Como propietario, al invitar un correo ya registrado quiero ver "Este usuario ya está registrado en Cuotly" y la acción **Añadir al espacio**, para no duplicar cuentas.
- **HU-05** · Como usuario, quiero ver y cerrar mis sesiones activas.

### Restaurantes
- **HU-06** · Como administrador, quiero crear un grupo y sus establecimientos, con código automático, para organizar a mis clientes.
- **HU-07** · Como administrador, quiero asignar un plan y servicios a un establecimiento y ver su ciclo de consumo vigente.
- **HU-08** · Como propietario global de un grupo, quiero acceder a todos sus establecimientos, incluidos los futuros.
- **HU-09** · Como administrador, quiero cambiar el estado de un establecimiento y que el motivo se muestre junto al estado.

### Solicitudes
- **HU-10** · Como restaurante, quiero crear una solicitud con descripción y archivos, guardarla como borrador y enviarla.
- **HU-11** · Como administrador, quiero ver la clasificación propuesta con su evidencia y validarla o corregirla antes de que la vea el cliente.
- **HU-12** · Como restaurante, quiero ver la propuesta final con categoría, consumo y plazo aproximado, y aceptarla o rechazarla.
- **HU-13** · Como administrador, quiero pedir información adicional y que el contador se detenga mientras espero al cliente.
- **HU-14** · Como administrador, quiero rechazar una solicitud explicando el motivo, sin que consuma cambios.
- **HU-15** · Como restaurante, quiero copiar una solicitud y pegarla en otro establecimiento del mismo grupo como borrador.

### Trabajos y tareas
- **HU-16** · Como propietario, quiero que un trabajo se asigne solo cuando hay un único candidato válido, y ver una recomendación cuando hay varios.
- **HU-17** · Como trabajador, quiero ver mi cola con el trabajo recomendado ahora, pudiendo empezar otro autorizado.
- **HU-18** · Como trabajador, quiero pulsar **Comenzar** y ver mi contador de ejecución exacto.
- **HU-19** · Como trabajador, quiero marcar un bloqueo por falta de información del cliente y que el contador se pause.
- **HU-20** · Como trabajador, quiero publicar directamente al terminar, sin aprobación previa.
- **HU-21** · Como trabajador, quiero desglosar un trabajo en tareas y repartirlas, y que los puntos se repartan con ellas.
- **HU-22** · Como trabajador, quiero solicitar una reasignación explicando el motivo, sin que se reinicie el contador.
- **HU-23** · Como restaurante, quiero pedir la corrección mínima gratuita de un cambio publicado dentro de su ventana.

### Consumos y finanzas
- **HU-24** · Como restaurante, quiero ver cuántos cambios de cada categoría me quedan en el ciclo actual y cuándo se renuevan.
- **HU-25** · Como administrador, quiero ver el libro de consumos de un establecimiento con cada apunte, su motivo y su autor.
- **HU-26** · Como administrador, quiero registrar la confirmación de un cobro con fecha, importe, método y justificante.
- **HU-27** · Como trabajador, quiero marcar como pagado un cobro de un restaurante asignado, sin entrar en Finanzas.
- **HU-28** · Como propietario, quiero ver el panel financiero con previsto, cobrado, pendiente, vencido e ingreso recurrente.

### Equipo y calendario
- **HU-29** · Como propietario, quiero asignar un administrador principal a cada trabajador y un sustituto con fechas.
- **HU-30** · Como trabajador, quiero declarar mi disponibilidad y solicitar una ausencia.
- **HU-31** · Como administrador, quiero aprobar una ausencia y ver qué trabajos quedan sin cobertura.
- **HU-32** · Como propietario, quiero configurar festivos y cierres del espacio, con auditoría.

### Transversales
- **HU-33** · Como usuario, quiero buscar desde cualquier pantalla con `Ctrl/Cmd + K` y ver solo lo que puedo ver.
- **HU-34** · Como usuario, quiero un centro de notificaciones con enlaces que abran el elemento exacto.
- **HU-35** · Como restaurante, quiero conversar sobre una solicitud y adjuntar archivos, viendo siempre "Equipo de mantenimiento".
- **HU-36** · Como propietario, quiero consultar la auditoría de mi espacio.

---

## 23. Criterios de aceptación de la Fase 1

La fase no está terminada hasta que **todos** se cumplen y están cubiertos por tests automáticos.

### Seguridad de acceso
- **CA-01** · Un usuario sin permiso no puede ejecutar la operación **ni por URL directa, ni por llamada a la API, ni manipulando el cliente**. Existe un test por cada celda relevante de la matriz de permisos.
- **CA-02** · Un usuario de un espacio no puede leer **ni una sola fila** de otro espacio, verificado con consultas directas a la base de datos usando su identidad.
- **CA-03** · Un trabajador no puede ver finanzas globales, credenciales ni archivos de facturación.
- **CA-04** · Un cliente no ve en ningún punto de la interfaz, correo o PDF el nombre de una persona del equipo.

### Integridad de consumos
- **CA-05** · Dos aceptaciones simultáneas sobre el último crédito disponible: solo una lo consume; la otra recibe un error claro. Test de concurrencia real.
- **CA-06** · Cancelar antes de Comenzar devuelve el consumo; cancelar después lo mantiene.
- **CA-07** · Una devolución cuyo ciclo original ya cerró genera un crédito compensatorio en el ciclo actual, y ese crédito caduca con él.
- **CA-08** · El saldo mostrado siempre es igual a la suma de los apuntes del libro. No existe ninguna ruta de código que actualice un contador de consumo con UPDATE.
- **CA-09** · Una renovación no altera el ciclo al que pertenece un consumo ya aceptado.

### Integridad temporal
- **CA-10** · Los tres contadores son reproducibles en servidor a partir de `timer_events`: recalcular desde cero da el mismo resultado.
- **CA-11** · Los ejemplos del reloj laboral de RN-CLK pasan como tests, incluido el cambio de horario de verano.
- **CA-12** · Una nueva aceptación por cambio de clasificación reinicia T2 desde cero; una reasignación no lo reinicia.
- **CA-13** · Un bloqueo pausa T3 y al reanudarse el tiempo restante es exactamente el que había.
- **CA-14** · "Fuera de plazo" se calcula y puede coexistir con En curso o Bloqueado.

### Trazabilidad
- **CA-15** · Para cualquier solicitud, trabajo, pago o corrección puede reconstruirse quién, qué, cuándo, desde qué contexto, valor anterior, valor nuevo y motivo cuando corresponda.
- **CA-16** · Ninguna operación de la aplicación puede editar o borrar una fila de auditoría.

### Idempotencia
- **CA-17** · Pulsar dos veces aceptar, comenzar, publicar, pagar o completar produce un único efecto y una única notificación.
- **CA-18** · El fallo del envío de un correo no revierte la operación de negocio que lo originó.

### Experiencia
- **CA-19** · Cada flujo principal (solicitar, aceptar, asignar, comenzar, bloquear, publicar, corregir, pagar o confirmar, consultar, gestionar equipo) puede completarse **íntegramente en móvil**, con la anchura de un teléfono, sin recurrir al escritorio.
- **CA-20** · Ninguna pantalla muestra números ficticios: sin datos se indica el motivo (no conectado, sin datos todavía, error, periodo insuficiente).
- **CA-21** · Cada entidad y cada estado se llama **igual** en escritorio, móvil, correo, PDF e historial.
- **CA-22** · Contraste WCAG AA verificado y navegación completa por teclado en los flujos principales.

---

## 24. Fuera de alcance

### 24.1 Fuera de alcance de la Fase 1 (llegan en fases posteriores)
Menú Diario completo · integraciones analíticas · oportunidades · informes de rendimiento digital ·
app móvil nativa y push · panel de Administración de Cuotly · suscripciones Pro/Agency y su facturación ·
prueba gratuita de 7 días · presupuestos completos · exportación e importación masiva · centro de ayuda ·
página de estado · trabajo sin conexión.

### 24.2 Fuera de alcance del producto
Nóminas · contratos laborales · fichaje horario · recursos humanos · retoque fotográfico avanzado ·
producción fotográfica · monitorización de reservas o delivery · automatización real de LandingSite ·
chat privado cliente–trabajador · vídeos en archivos · eliminación de mensajes · personalización de
colores o marca blanca · modo oscuro · publicidad · cobro automático con Stripe.

### 24.3 Pendiente deliberadamente — no inventar
Agente Cuotly · bloque legal y fiscal completo · API pública y webhooks · precio del almacenamiento
adicional · fórmula ponderada de recomendación de trabajador · categoría de puntos para tareas de más
de 4 horas · umbrales de oportunidades y definición de impacto y esfuerzo · sincronización bidireccional
de calendarios.

**Si una tarea toca cualquiera de estos puntos: deja el placeholder documentado y pregunta.**
