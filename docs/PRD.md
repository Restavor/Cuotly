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
`plans` · `plan_versions` · `services` · `service_versions` · `subscriptions` · `consumption_cycles` · `consumption_entries` · `quotes` *(flujo completo desde la migración 80, Hito 12, §26)* · `acceptances`

**Operación**
`requests` · `request_versions` · `classifications` · `jobs` · `tasks` · `assignments` · `supervisions` · `state_events` · `timer_events` · `blocks` · `corrections`

**Comunicación y archivos**
`conversations` · `conversation_participants` · `messages` · `message_edits` · `internal_notes` · `files` · `file_versions` · `file_links`

**Finanzas**
`charges` · `payments` · `payment_confirmations` · `receipts` · `financial_entries`

**Sistema**
`notifications` · `notification_preferences` · `calendar_events` · `holidays` · `space_working_hours` · `ai_usage`

**Menú Diario** *(Fase 2, Hito 9, migración 77)*
`menu_templates` · `menus` · `menu_versions` · `menu_publications` · `menu_events` · `menu_update_cycles` · `menu_update_entries`

**Datos e informes** *(Fase 3, Hito 13, migración 81, §27)*
`integrations` · `integration_credentials` · `sync_runs` · `metric_points`

> Las entidades de informes y oportunidades se crean en sus hitos (15 y 16).
> No las adelantes, pero no diseñes nada que impida añadirlas.

### 5.3 Entidades preparadas pero no explotadas en Fase 1

`platform_roles` (Administrador de Cuotly), `ai_usage` (medición del consumo de IA por espacio, que
según el modelo comercial se facturará aparte al propietario del espacio). `quotes` salió de esta lista
el 13/09/2026: su flujo completo es el §26 (Fase 2, Hito 12, migración 80).

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

- **RN-COM-08**: 229 € + IVA al mes; 199 € + IVA si el establecimiento tiene plan Premium activo. *(Hito 12, migración 80: la mensualidad del servicio se emite al contratar y en cada renovación con `generate_monthly_charge_internal()`; "Premium" es el plan activo con `plans.grants_priority`, decisión 20. `service_monthly_price()` dice a la pantalla cuál de los dos se aplica.)*
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
- **RN-JOB-06**: un trabajo presupuestado aparte puede requerir una aceptación operativa específica. *(Hito 12: con `quotes.requires_payment_before_start`, Comenzar espera al cobro o a la autorización registrada de `authorize_quote_start()`; RN-QUO-05.)*

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
- **RN-CON-03**: un trabajo presupuestado aparte **no consume** la bolsa del plan. *(Hito 12: `accept_request()` no mira la bolsa cuando la solicitud tiene presupuesto aceptado; la aceptación queda `budgeted` y el trabajo lleva `quote_id`; RN-QUO-02.)*
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
- **RN-COR-10 (Menú Diario, enmienda 29/08/2026)**: la corrección mínima también existe en Menú Diario, pero **no se garantiza su ejecución** si la edición o la petición de cambio llega después de las 21:00 del día anterior. *(Hito 11: `menu_corrections`; una por publicación, RN-COR-01; el error del equipo no la gasta, RN-COR-07; la ventana de RN-COR-02 son 72 h de reloj porque el calendario de Menú Diario no tiene días no laborables, RN-CLK-09.)*

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
llega en la Fase 3 (las conexiones y sus datos, §27, desde la migración 81; las pantallas, Hito 14).

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
- **RN-FIN-01b (añadida 08/09/2026)**: la mensualidad **vence a los `payment_term_days` naturales de emitirse**, un dato configurable de cada espacio con **7 días por defecto** que solo cambia el propietario. Antes no existía plazo alguno y el cobro se emitía con `due_at = cycle_start`, es decir **ya vencido**: RN-FIN-10 pausaba el restaurante veinticuatro horas después de emitirle la cuota. El plazo se congela en el cobro al emitirlo, igual que el tipo impositivo de RN-FIN-08: cambiarlo mueve las mensualidades futuras y ninguna de las ya emitidas. Decisión 15 de `docs/DECISIONES.md`.
- **RN-FIN-02**: estados de cobro: `pending` · `paid` · `partially_paid` · `overdue` · `waived` · `refunded`.
- **RN-FIN-03** (corregida 31/08/2026): métodos registrados: **transferencia o Bizum**. Sin Stripe ni pasarela, los pagos se registran a mano, así que no hay tarjeta ni domiciliación. La redacción anterior listaba cinco métodos y contradecía a CLAUDE.md y a la Especificación Maestra; resuelto por Bosco (decisión 10 de `docs/DECISIONES.md`).
- **RN-FIN-04**: propietario y administradores confirman, corrigen y gestionan cobros.
- **RN-FIN-04b (aclarada 01/09/2026)**: **reembolsar deja el cobro reabierto**. `refund_charge` revierte el pago, así que la deuda vuelve a estar viva y el estado se deriva de la fecha de vencimiento: **Vencido** si ya pasó, **Pendiente** si aún no. Devolver el dinero y que además el cliente no deba nada es una operación **distinta** —cancelación/anulación/abono del cobro— que **no existe todavía**: no se improvisa dentro de `refund_charge`. Decisión 12 de `docs/DECISIONES.md`.
- **RN-FIN-05**: un **trabajador** puede marcar "Pagado" desde la ficha de un restaurante asignado sin acceder al módulo Finanzas. Indica fecha, importe y método, y puede adjuntar justificante. **No** puede cambiar precios, perdonar deuda, reembolsar ni ver ingresos globales. Su acción queda auditada.
- **RN-FIN-06**: el restaurante puede subir un justificante, pero la confirmación siempre corresponde al equipo.
- **RN-FIN-07**: visibilidad: propietario global ve el grupo completo; propietario local, su establecimiento; Editor solo con el permiso `view_billing`; Consulta, nada.
- **RN-FIN-08**: se muestran base imponible, impuesto y total. Restavor usa IVA 21 %; otros espacios configuran el suyo.
- **RN-FIN-09**: en Fase 1 Cuotly **no emite facturas**: permite adjuntar la factura oficial emitida externamente para su descarga. La numeración fiscal está en el bloque legal pendiente.

### 17.1 Impago del restaurante

- **RN-FIN-10** (aclarada 31/08/2026): +24 h naturales desde el vencimiento → establecimiento **Pausado por impago**, y el **servicio se detiene ya aquí**. La redacción anterior no lo decía y el código sí lo hacía a medias (paraba los contadores a las 24 h pero no impedía arrancar otros nuevos); resuelto por Bosco, decisión 11 de `docs/DECISIONES.md`.
- **RN-FIN-11**: +72 h naturales → establecimiento **Suspendido por impago**. El servicio ya estaba detenido desde las 24 h; lo que cambia a las 72 h es el estado y su gravedad de cara al cliente.
- **RN-FIN-12**: se detienen trabajos, publicaciones y contadores, desde las +24 h. **No se borra información.**
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
| Condiciones nuevas de un plan o servicio (decisión 19, 12/09/2026) | Quien puede aceptarlas por cada restaurante con suscripción activa: propietario local y propietario global del grupo. En Cuotly y por correo; el push, con la app móvil |
| Menú Diario · publicación pedida sin asignar (Fase 2) | Propietario y **todos** los administradores. Nunca el restaurante ni un trabajador no asignado |
| Menú Diario · menú asignado o reasignado | Trabajador asignado, propietario y administradores |
| Menú Diario · falta información para publicar | Solo el restaurante (todos sus miembros con acceso vigente). Es a él a quien se le pide |
| Menú Diario · menú publicado | Restaurante, propietario y administradores. En Cuotly y por correo |
| Menú Diario · error de publicación en LandingSite | Propietario y administradores. El restaurante no ve la organización interna (P7) |
| Integración · sincronización fallida (Fase 3, RN-INT-04) | Propietario y administradores, una vez por racha de fallos. Nunca el restaurante ni un trabajador |
| Integración · hace falta volver a autorizar (Fase 3, RN-INT-04) | Propietario y administradores, **y** los propietarios del restaurante (local y global del grupo): son quienes pueden autorizar de nuevo. No el Editor ni Consulta |

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

**Qué es "la operativa" de un administrador** (confirmado el 04/09/2026, decisión 14 de
`docs/DECISIONES.md`): **toda la operativa diaria, incluidas finanzas, cambios, menús e incidencias**.
Quedan fuera la **configuración del espacio** (§125) y la **gestión y composición del equipo** —
invitaciones, permisos, supervisores y demás capacidades reservadas al propietario. El criterio no es una
lista aparte: **la capacidad que hace falta para ver una acción es la misma que hace falta para
ejecutarla**, así que lo que queda fuera es exactamente lo que el propietario no delega
(`manage_space`, `invite_member`). Las acciones cuya visibilidad no depende de una capacidad sino de la
fila —trabajos, solicitudes, tareas, archivos, ausencias, correcciones— se resuelven preguntando por esa
fila, que es lo que significan "las operaciones autorizadas".

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

---

## 25. Menú Diario — Fase 2 (RN-MEN)

Transcripción con número de §57 a §64 de la especificación maestra, para que cada regla tenga su test
(CLAUDE.md, regla 3 del flujo). No añade ninguna regla nueva: donde la maestra da ejemplos, aquí se
dice que son ejemplos. El servidor y el dominio están en la migración 77 (Hito 9); las plantillas
visuales, el PNG y el PDF y las pantallas del restaurante en la 78 (Hito 10); las pantallas del
equipo, el recordatorio de las 20:00 y la corrección mínima en la 79 (Hito 11). El calendario operativo
completo (§75, §76) y los presupuestos adicionales (§26) en la 80 (Hito 12).

- **RN-MEN-01**: cada menú registra **nombre, tipo, fecha objetivo, plantilla, contenido, versión y estado**. Se pueden preparar varios menús futuros y varios para el mismo establecimiento y fecha. Los tipos son los cinco que nombra la maestra (`daily` · `christmas` · `kids` · `groups` · `special_event`); añadir uno es una decisión de producto, no un desplegable que se amplía.
- **RN-MEN-02**: el contenido son **primeros, segundos, postres, bebida, precio y nota u observación** (§58).
- **RN-MEN-03**: edición y guardado ilimitados antes de la publicación. **Cada guardado es una versión nueva e inmutable** (RN-DAT-07): ninguna se edita ni se borra. "Copiar menú anterior" crea un borrador con el contenido vigente como versión 1. Un menú publicado o cancelado no se edita: se copia.
- **RN-MEN-04**: descargar el PNG o el PDF **no consume** actualización (§59). *(Hito 10.)*
- **RN-MEN-05**: **pedir que el equipo publique consume 1 actualización**, en el momento de pedirlo; los menús especiales también consumen. Cancelar antes de "Publicado" la devuelve (RN-CON-08 aplicado); después no. Un error del equipo se devuelve o corrige sin perjuicio para el cliente: la devolución la registra el equipo con motivo (RN-CON-12) y **una sola vez** por publicación (CA-17). Se aplican RN-CON-06 (solo una petición consume el último crédito, con bloqueo de fila sobre el ciclo), RN-CON-07 (dos pulsaciones, un efecto), RN-CON-10 y RN-CON-11 (si el ciclo del consumo ya cerró, crédito compensatorio en el vigente, que caduca con él).
- **RN-MEN-06**: el flujo es **manual** (§61): el restaurante prepara y pide, Cuotly asigna un trabajador de Menú Diario (con un único candidato válido, solo; con varios o ninguno, a mano por `assign_jobs`), el trabajador descarga la plantilla generada, la sube a LandingSite y pulsa **Marcar como publicado**. **No existe botón Comenzar**. Al marcar publicado se registran fecha y hora, usuario, versión publicada, plantilla y consumo, y se avisa al cliente. Sobre una publicación actúan el trabajador asignado, el propietario y los administradores; un trabajador no asignado, no.
- **RN-MEN-07**: el contenido puede modificarse libremente **hasta las 21:00 del día anterior** a la fecha objetivo, en la zona horaria del espacio. Si la versión definitiva y la petición llegaron antes de esa hora, la publicación **se garantiza antes de las 08:00**. Los cambios posteriores se aceptan, quedan marcados y **no se garantiza** que entren. El trabajador ve los cambios de versión y su hora. La garantía es un estado derivado que calcula el servidor (RN-DAT-05).
- **RN-MEN-08**: Menú Diario opera **todos los días del año, festivos incluidos**, con su propio calendario (RN-CLK-09). A las 20:00 se recuerda al propietario y a los Editores si no hay menú preparado para el día siguiente. *(Hito 11: `run_daily_menu_sweep()`, tipo `daily_menu_sweep` de la cola de barridos; "preparado" es cualquier menú de mañana que no sea borrador ni cancelado. El mismo barrido avisa al equipo a partir de las 08:00 de las publicaciones garantizadas sin publicar, §62.)*
- **RN-MEN-09**: los estados son los once de §63, con este nombre interno: `draft` · `prepared` · `publication_requested` · `pending_assignment` · `assigned` · `needs_information` · `reviewing` · `ready_to_publish` · `published` · `cancelled` · `publication_error`. "Publicación solicitada" y "Pendiente de asignación" son dos estados por los que pasa la misma petición: el primero deja constancia de que el restaurante pidió y consumió, el segundo de que el equipo aún no tiene a nadie. Guardar una versión mientras "Falta información" es la respuesta y pasa a "Revisando". La máquina vive en `src/core/menu-states.ts` y el servidor la hace cumplir.
- **RN-MEN-10**: el historial conserva fechas, platos, precio, nota, plantilla, versiones, estados, solicitudes de publicación, consumo, cancelaciones y usuario publicador (§64): `menu_versions`, `menu_events`, `menu_publications` y `menu_update_entries` son libros inmutables. Las descargas se registran en el Hito 10.
- **RN-MEN-11**: **tres plantillas personalizadas iniciales, incluidas una sola vez** (RN-COM-10). Archivar una incluida no libera su plaza. Sustituciones, nuevas plantillas y rediseños se presupuestan aparte (`origin = quoted`). Las crea el equipo (`manage_clients`) y el restaurante elige cualquiera de las suyas en cada menú. *(Hito 12: una plantilla `quoted` cuelga de un presupuesto aceptado de ese restaurante y de tipo plantilla, `menu_templates.quote_id`; sin él, `create_menu_template()` la rechaza.)*
- **RN-MEN-12**: el restaurante **nunca ve quién es el trabajador** (P7, CLAUDE.md MUST NOT). La publicación (`menu_publications`) es una fila interna del equipo; lo que el cliente necesita saber (estado, fecha de publicación, versión y plantilla publicadas) está en `menus`. En las filas que sí son suyas, la columna con el actor va con privilegio de columna.
- **RN-MEN-13**: con el servicio detenido por impago (RN-FIN-12), en solo lectura o archivado, **ni se pide ni se marca una publicación** (§85: "se detienen trabajos, publicaciones y contadores").

Quién prepara menús por el restaurante: propietario local, Editor y propietario global del grupo (§4.3); Consulta no. El equipo con `manage_requests` puede prepararlos en su nombre. El módulo solo existe para un restaurante con suscripción activa a un servicio de tipo Menú Diario (`services.kind = 'daily_menu'`), que incluye `services.included_updates` actualizaciones por ciclo (30 en Restavor, RN-COM-09).

---

## 26. Presupuestos adicionales — Fase 2 (RN-QUO)

Transcripción con número de §84 de la especificación maestra, con el mismo criterio que §25: cada regla
con su test, ninguna regla nueva. Donde §84 calla, la lectura aplicada se dice aquí y está anotada en
`docs/DECISIONES.md` (la 11 quedó resuelta como decisión 21; la pendiente 12, confirmada por Bosco el 14/09/2026 como decisión 23). Servidor, dominio
(`src/core/quotes.ts`) y pantallas en la migración 80 (Fase 2, Hito 12).

- **RN-QUO-01**: un presupuesto pasa por **borrador, enviado, aceptado o rechazado, pendiente de pago y pagado** (§84). Se guardan cuatro (`draft`, `sent`, `accepted`, `rejected`); **pendiente de pago y pagado se derivan** del cobro que emite la aceptación (RN-DAT-05, `quote_status()`), y "aceptado" a secas no se enseña: aceptar es el instante en que nace el cobro. Cada presupuesto lleva código propio del espacio (`PRE-0001`), concepto, alcance, base imponible, impuesto y total con el tipo del espacio **congelado al crearlo** (RN-FIN-08, P4). Un borrador se corrige; lo enviado no (el restaurante decide sobre lo que leyó).
- **RN-QUO-02**: **tras la aceptación se crea solicitud o trabajo sin consumir bolsa** (§84, RN-CON-03). Con una solicitud presupuestada, la aceptación del presupuesto **es** la aceptación de la solicitud y el trabajo nace presupuestado (`jobs.quote_id`, `acceptances.budgeted`); sin solicitud, se crea una ya validada y aceptada con el alcance del presupuesto. Un presupuesto también puede pagar una **plantilla de Menú Diario** (RN-MEN-11): entonces no crea trabajo y la plantilla `quoted` cuelga de él. Una solicitud tiene como mucho un presupuesto abierto y uno aceptado, y mientras tenga uno abierto o rechazado **no se acepta por fuera**: el servidor lo impide, no el botón.
- **RN-QUO-03**: presupuesta el equipo con `manage_requests` (propietario y administradores), entre la validación interna y la aceptación del restaurante. Lo **acepta o rechaza quien representa al restaurante** —propietario local o propietario global del grupo, la misma lista que acepta las condiciones (§4.3)—; el Editor lo ve si ve la facturación (RN-FIN-07) pero no responde; Consulta no lo ve. **El propietario y los administradores del espacio también pueden registrar la respuesta en nombre del restaurante** cuando la dio fuera de Cuotly (decisión 21): con motivo obligatorio (cómo y cuándo respondió), marcado en la fila y en la auditoría, y con aviso a los propietarios del restaurante de lo que se registró en su nombre. Un trabajador no registra nada. Un borrador no ha salido del equipo: el restaurante solo sabe que "se está preparando". *(§84 no dice quién acepta: decisión 21 de DECISIONES.)*
- **RN-QUO-04**: aceptar **emite el cobro** con los importes del presupuesto en el libro inmutable (RN-FIN-02), con vencimiento a `payment_term_days` (RN-FIN-01b) y sin suscripción: es un cobro puntual. Pagarlo deja el presupuesto en "pagado" sin que nadie lo marque. Rechazar no emite nada y **deja la solicitud donde estaba**: el equipo puede enviar otro o el restaurante puede no continuarla. Cada paso avisa a quien toca (§18: enviado → quien puede aceptarlo; aceptado y rechazado → propietario y administradores) y deja apunte con actor, fecha y motivo (§21.2).
- **RN-QUO-05**: **puede exigirse pago previo o autorizar el inicio antes del pago; la autorización queda registrada** (§84, RN-JOB-06). `requires_payment_before_start` lo fija el equipo al presupuestar. Con pago previo exigido, **Comenzar** espera al cobro o a que alguien con `manage_finance` autorice el inicio, y esa autorización lleva actor, fecha y motivo en auditoría. Sin pago previo exigido, el trabajo puede empezar con el cobro pendiente. Enviar, aceptar, rechazar y autorizar dos veces producen un solo efecto y un solo aviso (CA-17, RN-CON-07).

Lo que el restaurante ve de un presupuesto no lleva ninguna identidad del equipo (P7): `quotes` tiene
el `select` concedido columna a columna, como `charges`, y quién envió, decidió o autorizó sale de
`audit_log`. El calendario operativo de §75 y §76 no tiene reglas numeradas propias: `space_calendar()`
deriva los eventos (RN-DAT-05) y RLS decide qué ve cada uno; los límites de comenzar y de ejecución no
entran en él porque viven en el reloj laboral de `src/core/business-clock.ts` (CA-10).

---

## 27. Integraciones analíticas — Fase 3 (RN-INT)

Transcripción con número de §115 a §122, §126, §94, §163 y §178 de la especificación maestra, con el
mismo criterio que §25 y §26: cada regla con su test, ninguna regla nueva. Donde la maestra calla
(frecuencia "adaptada", cadencia de reintentos, qué es "desactualizado", cuándo es "definitiva" la
suspensión), la lectura aplicada se dice aquí; Bosco la confirmó el 14/09/2026 como decisión 24 de
`docs/DECISIONES.md`. Servidor y dominio (`src/core/integrations.ts`) en la
migración 81 (Fase 3, Hito 13); los adaptadores de cada fuente, el proceso de la cola, la revocación
remota (migración 82) y las pantallas, en el Hito 14 (14/09/2026).

- **RN-INT-01**: las integraciones son **por establecimiento** y son cinco: **GA4, Search Console,
  Business Profile, Clarity y PageSpeed** (§115). Una fila por restaurante y fuente
  (`integrations`, única por `establishment_id` y `provider`). Un propietario global puede autorizar
  varios establecimientos del grupo. Las plataformas de reservas, pedidos y delivery **no** son
  integraciones (§120): se anotan como herramientas y enlaces del restaurante, sin sección de control;
  LandingSite tampoco (§121): se registra como plataforma web y la publicación de Menú Diario es manual.
- **RN-INT-02**: la conexión es **OAuth cuando exista y clave API solo cuando sea necesaria** (§116):
  GA4, Search Console y Business Profile van por OAuth con Google; Clarity y PageSpeed, por clave.
  **Credenciales y tokens cifrados; contraseñas nunca visibles** (§135): el servidor de la aplicación
  cifra con una clave que solo existe en su entorno (`INTEGRATIONS_VAULT_KEY`) y la base guarda
  únicamente el texto cifrado en `integration_credentials`, una tabla cuya columna `ciphertext` no
  tiene `select` para nadie y que solo lee `service_role`. Existe un **botón de comprobación** que
  verifica la credencial sin importar datos. El propietario del restaurante puede autorizar una cuenta
  que le pertenezca; el propietario del espacio gestiona la integración sin ver su contraseña.
- **RN-INT-03**: los estados son los **siete** de §117, con este nombre interno: `not_connected` ·
  `pending_authorization` · `connected` · `syncing` · `needs_attention` · `error` · `disconnected`.
  "Requiere atención" es que hace falta una persona (volver a autorizar, o una propiedad que ya no
  existe); "Error" es un fallo que Cuotly reintenta sola. De cada integración se enseña **cuenta,
  establecimiento, última sincronización, siguiente intento y error**. **No existe botón "Sincronizar
  ahora"** (§117, CLAUDE.md): la única forma de adelantar una sincronización es que la programe el
  sistema.
- **RN-INT-04**: las frecuencias son las de §118: **GA4 y Search Console, diaria; PageSpeed, semanal**
  y cuando el sistema lo programe; las demás, "frecuencia adaptada" —Business Profile y Clarity van a
  diario, decisión 24—. Cuotly **conserva el último dato válido, lo marca como desactualizado si
  falla y reintenta**: tras un fallo transitorio el siguiente intento espera 1 h, luego 4 h, 16 h y 24 h
  como máximo; "desactualizado" es no tener una sincronización correcta en el doble de la frecuencia.
  **El propietario y los administradores reciben aviso** del fallo (una vez por racha, no una por
  intento); **el propietario del restaurante solo si debe autorizar de nuevo** (§18).
- **RN-INT-05**: **propietario y administradores gestionan las conexiones; solo el propietario
  introduce, sustituye o elimina credenciales sensibles; los trabajadores nunca las ven** (§119,
  §126). Un trabajador autorizado consulta el estado y los datos del restaurante, y no conecta ni
  desconecta. El propietario del restaurante (local o global del grupo, la misma lista que acepta las
  condiciones) conecta y desconecta lo suyo por OAuth; el Editor y Consulta, no. Una clave API la
  introduce solo el propietario del espacio.
- **RN-INT-06**: **al suspenderse definitivamente el mantenimiento se revocan las autorizaciones
  externas; los datos históricos importados permanecen** (§119). "Definitivamente" se ha leído como
  **archivar** el restaurante (decisión 24): archivar desconecta las cinco, marca las credenciales
  como revocadas y deja pendiente la revocación remota del token, que hace el proceso de la cola;
  suspendido por impago o al terminar la permanencia, la sincronización se detiene y las credenciales
  se conservan para reactivar. **Toda conexión, desconexión y error queda auditado** (§21.2), con la
  familia `integration` de la auditoría, visible para quien gestiona la cartera (`manage_clients`).
- **RN-INT-07**: **los datos ya importados se conservan aunque cambie el plan o se desconecte la
  fuente; se indica la fecha de última sincronización; nunca se presenta información desactualizada
  como actual** (§94). Los puntos de métrica (`metric_points`) no se borran al desconectar ni al
  cambiar de plan; cada uno lleva cuándo se obtuvo, y toda pantalla que los enseñe dice uno de los
  cinco motivos de §178 cuando no hay dato: **integración no conectada, todavía no hay datos, última
  sincronización (dato desactualizado), error o periodo insuficiente**.
- **RN-INT-08**: ante un fallo de conexión (§163) Cuotly **indica si la acción se completó, reintenta
  solo operaciones seguras** (leer datos, sí; una revocación remota, una vez), **conserva el último
  dato externo válido con su antigüedad y registra el error sin secretos**: el texto del error se pasa
  por un filtro que oculta lo que parezca un token o una clave antes de guardarlo, y nunca se guarda
  una respuesta entera de la fuente.
- **RN-INT-09**: una sincronización es una ejecución con estado (`sync_runs`: pendiente, en curso,
  correcta o fallida), con inicio, fin, motivo del fallo y puntos escritos, que solo ejecuta el
  proceso de la cola con `service_role`: la aplicación no sincroniza desde una pantalla. Dos procesos a
  la vez no toman la misma ejecución (`for update skip locked`), y una ejecución no tumba a las demás.

Qué métricas guarda cada fuente lo fija §92 para GA4 (usuarios, sesiones, páginas más visitadas,
procedencia, dispositivos, ubicaciones aproximadas y conversiones configuradas) y para Search Console
(clics, impresiones, CTR, posición media, búsquedas principales y páginas que aparecen). Para Business
Profile, Clarity y PageSpeed la maestra solo nombra la fuente: su catálogo lo fijó el adaptador de
cada una en el Hito 14 con lo que su API devuelve, sin nada por encima (`METRICS_BY_PROVIDER` en
`src/core/integrations.ts`; decisión 25c de `docs/DECISIONES.md`): Business Profile, las impresiones
por superficie (Maps y Búsqueda, escritorio y móvil) y las acciones sobre la ficha (clics a la web,
llamadas, cómo llegar, conversaciones y reservas); Clarity, tráfico (sesiones, sesiones de robots,
usuarios distintos, páginas por sesión), comportamiento (profundidad de scroll, tiempo de interacción)
y señales de fricción (clics muertos, clics de rabia, vueltas rápidas, scroll excesivo, errores de
script, clics con error); PageSpeed, la puntuación de rendimiento y LCP, CLS, TBT, FCP y Speed Index
por estrategia (móvil y escritorio), más el INP de campo cuando Chrome tiene datos de esa URL. La
**decisión 26** añadió dos métricas a ese catálogo, las dos porque sin ellas dos de las nueve
oportunidades de §96 no se podían detectar: las **conversiones por dispositivo** de GA4
(`conversions_by_device`; las conversiones por evento no vienen cruzadas con el dispositivo, así que
sin esto no se puede comparar cómo convierte el móvil) y los **kilobytes ahorrables de las imágenes**
de PageSpeed (`uses-optimized-images` y `uses-responsive-images`, leídos de
`details.overallSavingsBytes`, que es donde Lighthouse pone los bytes). Lo
que la pantalla de "Informes y datos" enseña de cada fuente son los 28 últimos días completos con su
antigüedad, y "periodo insuficiente" (§178) se lee como menos de una semana con dato (una medición,
en PageSpeed): es una lectura aplicada y confirmada, anotada como decisión 25a. Las
oportunidades (§96 a §101) y los informes (§89 a §95) son los hitos 15 y 16. **Los umbrales de
detección, la definición de impacto y la de esfuerzo los fijó Bosco el 14/09/2026** (decisión 26,
sobre `docs/PROPUESTA-OPORTUNIDADES.md`): impacto es alto, medio o bajo según lo que toque el
problema —nunca euros, porque Cuotly no sabe lo que vale una reserva— y esfuerzo **es la categoría
del cambio** (Pequeño, Fotográfico, Mediano o Grande), que ya trae su duración de RN-SLA-12 y lo que
gasta de la bolsa del plan.

---

## 28. Oportunidades por reglas deterministas — Fase 3 (RN-OPP)

Transcripción con número de §96 a §101 de la especificación maestra, con el mismo criterio que §25,
§26 y §27. La diferencia con esos tres: la maestra da los nueve ejemplos de oportunidad y los campos
de cada una, pero **no dice cuándo salta ninguna**, ni qué es impacto, ni qué es esfuerzo. Eso lo
prohibía inventar CLAUDE.md y lo fijó Bosco el 14/09/2026 (**decisión 26** de `docs/DECISIONES.md`,
razonada en `docs/PROPUESTA-OPORTUNIDADES.md`), que es de donde sale **todo número** de este
apartado. Servidor, dominio y pantallas en la migración 84 y en `src/core/opportunities.ts` (Fase 3,
Hito 15).

- **RN-OPP-01**: una oportunidad pertenece a un **restaurante** y nace de una de las **nueve reglas
  deterministas** de §96 sobre los datos importados, o la **añade el equipo a mano** (§97). No usa IA
  (RN-CLS-06): la misma entrada da la misma salida, que es lo que permite que una detección repetida
  actualice en vez de duplicar. **Sin evidencia no hay oportunidad** (§96, "no debe afirmarse algo sin
  evidencia suficiente"): `upsert_detected_opportunity()` rechaza una automática con la evidencia
  vacía. Una oportunidad automática guarda su **regla, su sujeto y sus cifras**, nunca una frase: el
  título y la acción recomendada los escribe la pantalla desde `src/i18n/es.ts` (CLAUDE.md).
- **RN-OPP-02**: los **umbrales** son los de la decisión 26c, sobre la ventana de los **28 últimos
  días completos** comparada con los 28 anteriores (la misma de "Informes y datos", decisión 25b), y
  cada uno con su **suelo de ruido**: descenso de tráfico, 30 % o más con 100 sesiones o más antes ·
  CTR bajo, consulta con 100 impresiones o más en posición 10 o mejor y CTR bajo el 2 % · pérdida de
  posición, 50 impresiones o más, 3 puestos o más y acabar peor del 10 · lentitud, puntuación móvil
  bajo 50 o LCP móvil sobre 4 s **en dos análisis seguidos** · imágenes pesadas, 500 KB o más
  ahorrables en móvil · error técnico, errores de script en el 5 % o más de las sesiones con 100
  sesiones o más · baja conversión móvil, el móvil convierte la mitad o menos que el escritorio con
  100 sesiones móviles o más · búsquedas que salen muy abajo, consulta con 100 impresiones o más en
  posición peor que 20 · poco uso de botones, ficha de Google con 500 impresiones o más y acciones
  bajo el 2 %, o clics muertos y de rabia sobre el 5 % de las sesiones. **Ninguna salta si su fuente
  está desconectada, sin autorizar, con error o con el dato desactualizado** (P6, RN-INT-07), y la
  ventana se calcula en la **zona horaria del espacio** (CLAUDE.md). Las reglas las pasa el proceso de
  la cola (`/api/cola`) después de sincronizar, nunca una pantalla.
- **RN-OPP-03**: el **impacto** es alto, medio o bajo según **lo que toca el problema** (decisión
  26a): alto si rompe o estorba el camino por el que un cliente contacta —teléfono, cómo llegar,
  reserva, formulario— o afecta a más de la mitad del tráfico; medio si afecta a una parte visible o a
  una entrada de tráfico importante; bajo si afecta a una página, una consulta o un detalle suelto.
  **No se dice en euros**: Cuotly no sabe lo que vale una reserva ni cuántas visitas acaban en cena, y
  un número inventado en una pantalla de producción es lo que CLAUDE.md prohíbe. La **prioridad
  propuesta** sale del impacto (1 es lo primero). Impacto, prioridad y esfuerzo son **propuestas
  editables** (§96): en cuanto el equipo edita una, una detección posterior ya no la pisa.
- **RN-OPP-04**: el **esfuerzo es la categoría del cambio** —pequeño, fotográfico, mediano o grande—,
  sin escala nueva (decisión 26b): la categoría ya trae su duración —**1 a 3 días laborables**, 3 a 5 el
  grande: es el rango que se le dice al cliente (RN-SLA-16); la decisión 26b lo cita como RN-SLA-12,
  que es la misma tabla vista por dentro— y lo que gasta (una unidad de su bolsa, RN-CON-01). La pantalla dice "mediano, 1 a
  3 días laborables, gasta 1 de los 3 que te quedan"; y si el plan no incluye esa categoría o la bolsa
  está agotada, dice que **va a presupuesto** (RN-CON-03) en vez de fingir que está incluida.
- **RN-OPP-05**: los estados son los **ocho** de §98: `detected` · `recommended` · `under_review` ·
  `approved_for_report` · `discarded` · `in_progress` · `implemented` · `no_longer_applicable`. Quién
  mueve cada transición es §97: el **trabajador asignado** ve las automáticas, añade una a mano,
  aporta evidencia, recomienda y observa, y **no aprueba**; **aprobar, descartar, editar y ordenar**
  son del propietario y de los administradores **con "Aprobar informes"**, una capacidad concedida
  persona a persona (`space_memberships.can_approve_reports`, como `can_perform_jobs` del Hito 6).
  Descartar **exige motivo**. Mover al mismo estado dos veces no escribe dos apuntes (RN-DAT-09).
- **RN-OPP-06**: §99 · una **detección repetida actualiza la oportunidad existente** y no crea otra:
  la clave natural de una automática es (restaurante, regla, sujeto) y es la base la que lo impide,
  con un índice único. Cada detección queda además en el **libro inmutable** `opportunity_detections`
  con su evidencia y su periodo. Una **descartada conserva historial** y **reaparece si empeora**
  (severidad mayor que la que tenía al descartarla) **o si vuelve a cumplirse en un periodo que ya no
  se solapa** con el descartado, **indicando el descarte anterior**, que por eso no se borra.
- **RN-OPP-07**: **se detectan solas pero no se enseñan solas**: hasta que alguien no la aprueba, el
  restaurante no la ve —ni por pantalla ni por llamada directa—. Lo sostiene la política de RLS de
  `opportunities`, no que la pantalla no la pinte (CLAUDE.md). "Detectada", "recomendada" y "en
  revisión" son conversación interna del equipo; "descartada" no la ve nunca. Las notas del equipo y
  el libro de detecciones tampoco los ve: ahí se le deja fuera de la **fila**, como en `tasks` (P7).
- **RN-OPP-08**: §101 · **Básico ninguna** ("detección interna"), **Impulso las básicas aprobadas**,
  **Premium también las avanzadas**. **Avanzada** es la que **cruza dos fuentes** y **básica** la que
  sale de una sola (decisión 26e); hoy la única avanzada es "poco uso de botones", que mira la ficha de
  Google y la fricción de Clarity. Qué plan es cuál se decide por lo que el plan **es** y no por su
  nombre —Cuotly es multiempresa—: sin ningún cambio incluido es el de entrada, y el que concede
  prioridad (`plans.grants_priority`) es el alto, el mismo criterio de la decisión 20.
- **RN-OPP-09**: §100 · el restaurante puede **solicitar la mejora, pedir presupuesto o preguntar al
  equipo**. Las tres crean un **borrador de solicitud** con la oportunidad enganchada
  (`requests.opportunity_id`), que es lo que "con evidencia adjunta" significa, y desde ahí sigue el
  camino normal: enviar, análisis, aceptación, consumo o presupuesto. **No consume nada**: el consumo
  nace al aceptar (RN-CON-06). Pulsarlo dos veces devuelve el mismo borrador. Solo actúa quien escribe
  en el restaurante (Consulta no, §4.3) y solo sobre una oportunidad que puede ver.
- **RN-OPP-10**: toda decisión sobre una oportunidad deja **evento de estado y apunte de auditoría**
  con actor, fecha, valor anterior, valor nuevo y motivo (familia `opportunity`, visible con
  `manage_clients`, §21.2). Detectar y reabrir los escribe el barrido de la cola y su apunte lo dice
  dejando el actor nulo. La **evidencia no se edita**: son las cifras que dispararon la regla.

Dos métricas del catálogo de §27 existen solo porque estas reglas las necesitan, y se dicen aquí para
que no parezcan gratuitas: las **conversiones por dispositivo** de GA4 y los **kilobytes ahorrables de
las imágenes** de PageSpeed (decisión 26d). El Hito 15 añadió tres más por el mismo motivo —
`impressions_by_query`, `ctr_by_query` y `position_by_query`—: la decisión 26 escribe tres reglas "por
consulta" con el CTR y la posición de cada una, y el catálogo solo guardaba los **clics** de las diez
consultas con **más clics** de cada día; justamente las consultas que estas reglas buscan son las que
tienen impresiones y **no** tienen clics, así que con aquello no habría saltado ninguna. Las tres
salen de la respuesta de Search Console que ya se pedía, sin llamada nueva, y se quedan con las diez
mayores **por impresiones** de cada día.

Lo que el restaurante ve de una oportunidad no lleva ninguna identidad del equipo (P7): `opportunities`
tiene el `select` concedido columna a columna, como `charges` y `quotes`, y quién la detectó, aprobó,
descartó o editó sale de `audit_log`. Los **informes** (§89 a §95), donde "Incluir en informe" se
vuelve a decidir (§99), son el Hito 16.
