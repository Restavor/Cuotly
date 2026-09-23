# PRD — Cuotly · Fase 1

**Producto:** Cuotly · by Restavor
**Propietario:** Bosco Núñez (Restavor)
**Versión del documento:** 1.0 — 29 de agosto de 2026
**Alcance de este PRD:** nació para la Fase 1 y hoy cubre también las fases 2 y 3 —Menú Diario,
presupuestos, integraciones, oportunidades e informes— y, desde el 15/09/2026, la Fase 4 a medida que
se hace cada hito. El **plan** de las fases sigue en `ROADMAP.md`; las **reglas**, aquí.

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
| Plan de mantenimiento | plan | Producto que el espacio vende a un establecimiento (en Restavor: Básico, Impulso, Impulso+, Premium, Premium+). |
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

Todos los precios son **más IVA** (Restavor: 21 %). Los cuatro planes con cambios incluidos son los de
las fichas de Restavor del 16/09/2026 (decisión 39, migración 96); Básico se mantiene tal como estaba.

| Plan | Precio/mes | Pequeños | Fotográficos | Medianos | Grandes | Plazo de inicio | Prioridad |
|---|---:|---:|---:|---:|---:|---:|---|
| Básico | 99 € | 0 | 0 | 0 | 0 | 48 h laborables | — |
| Impulso | 299 € | 6 | 6 | 1 | 0 | 48 h laborables | Estándar |
| Impulso+ | 399 € | 16 | 12 | 3 | 0 | 24 h laborables | Alta |
| Premium | 499 € | 10 | 12 | 2 | 0 | 24 h laborables | Alta |
| Premium+ | 599 € | 25 | 24 | 5 | 1 | 24 h laborables | Máxima, superior en la cola |

Premium incluye **menos** cambios pequeños que Impulso+ (10 frente a 16) y es intencionado: es lo que
dice su ficha. Lo que cada ficha añade además de la bolsa, y que Cuotly recoge como **descripción
comercial del plan** sin construir ninguna restricción nueva (decisión 39, punto 5):

| Plan | Analítica | Informe | SEO | Oportunidades | Copias de seguridad |
|---|---|---|---|---|---|
| Impulso | GA4 con las métricas principales; Clarity con las señales principales | Resumen mensual + análisis completo trimestral | — | 1 oportunidad priorizada por ciclo | — |
| Impulso+ | GA4 detallado; Clarity con mapas, sesiones y fricciones | Completo mensual | — | Varias oportunidades | Mensual, cuando la plataforma lo permita |
| Premium | Avanzada con resumen mensual | Resumen mensual + comparativa completa trimestral | Revisión y detección | Hasta 2 prioridades por ciclo | — |
| Premium+ | Avanzada con análisis completo | Avanzado con comparativa mensual | Revisión y optimizaciones periódicas | Detección avanzada y priorización | Semanal, cuando la plataforma lo permita |

Qué oportunidades **ve** cada plan lo fija RN-OPP-08 (básicas o también avanzadas), no esta tabla.

- **RN-COM-01**: en Básico **cualquier** modificación se presupuesta aparte. No hay consumos incluidos.
- **RN-COM-02**: Impulso, Impulso+ y Premium no incluyen cambios grandes; se presupuestan aparte. Solo Premium+ incluye uno al mes.
- **RN-COM-03 (reescrita 19/09/2026, decisión 55)**: el plan decide **tres cosas distintas** que
  hasta hoy colgaban del mismo booleano `plans.grants_priority`, y separarlas es la regla:

  1. **El plazo de inicio** (`plans.start_sla_hours`, RN-SLA-02) **no lo decide el plan alto**: son
     48 h laborables en Básico e Impulso y 24 h en Impulso+, Premium y Premium+. **Premium+ no
     responde antes de 24 h**; Bosco lo confirmó el 19/09/2026 —"todos tienen de máximo 24 h"— y no
     hay ningún plazo más corto que inventar.
  2. **El turno dentro de ese plazo** (`plans.queue_rank`): a igualdad de todo lo demás se atiende
     primero al plan más alto. Bosco, 19/09/2026: *"si hay una solicitud de Premium+ y otra de
     Premium, se contestaría primero la de Premium+"*. En Restavor: Premium+ (2), Premium (1), el
     resto (0). **Esto el cliente no lo ve**: es el orden de trabajo del equipo, y enseñarle en qué
     puesto va frente a otros restaurantes no le sirve de nada y compromete a otros.
  3. **Si puede ordenar sus propias solicitudes** 1..N (`plans.can_order_requests`, RN-PRI): **Premium
     y Premium+**, decidido el 19/09/2026 —hasta entonces solo Premium+—. Esto **sí es visible**: es
     lo que la ficha de plan del diseño (páginas 96 y 97) llama "Prioridad: Alta / Superior", y es una
     capacidad que el restaurante compra, no la posición de nadie en una cola. Ahí no hay
     contradicción con el punto 2.

  **`plans.grants_priority` no cambia y sigue siendo solo de Premium+.** Es lo que decide el precio
  de Menú Diario (199 € en vez de 229 €, RN-COM-08) y el acceso a las oportunidades **avanzadas**
  (RN-OPP), las dos cosas que Bosco fijó el 16/09/2026 en la decisión 39 y que CLAUDE.md enumera. Dar
  esas dos a Premium por reutilizar el booleano habría sido deshacer una decisión suya sin que nadie
  lo pidiera.
- **RN-COM-04**: facturación mensual. Permanencia mínima inicial de 3 meses; después, renovación mensual automática.
- **RN-COM-05**: un cambio voluntario de plan inicia una nueva permanencia de 3 meses.
- **RN-COM-06**: los consumos se renuevan en la fecha de renovación del establecimiento y **no se acumulan**.
- **RN-COM-07**: no existen bolsas de horas. Los trabajos fuera de plan se presupuestan aparte y no consumen bolsa.

### 6.2 Servicio Menú Diario

- **RN-COM-08**: 229 € + IVA al mes; 199 € + IVA **solo** si el establecimiento tiene plan Premium+ activo. Impulso, Impulso+ y Premium **no** tienen descuento en Menú Diario (decisión 39). *(Hito 12, migración 80: la mensualidad del servicio se emite al contratar y en cada renovación con `generate_monthly_charge_internal()`; "Premium+" es el plan activo con `plans.grants_priority`, decisión 20. `service_monthly_price()` dice a la pantalla cuál de los dos se aplica.)*
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

### 6.5 Crear, editar y archivar planes y servicios (decisión 72, 23/09/2026)

Concreta §102–104 de la especificación maestra con la propuesta de
`docs/PROPUESTA-EDICION-DE-PLANES.md`, aceptada por Bosco con la opción A del punto 4.

- **RN-COM-19**: solo el **propietario del espacio** crea, edita y archiva planes y servicios. Los
  administradores asignan los que existen (§102).
- **RN-COM-20**: crea **versión nueva** cualquier cambio en lo que el restaurante contrata: precio
  (y, en un servicio, el precio con Premium+ de RN-COM-08), consumos incluidos por categoría,
  plazos de inicio y de realización, si ordena sus solicitudes, prioridad (`grants_priority`),
  nivel de informe y vigilancia de reseñas. Corregir el nombre o la descripción comercial **no**
  crea versión: se edita en el sitio y queda en la auditoría con el valor anterior y el nuevo.
- **RN-COM-21**: un plan o servicio que **no tiene ningún restaurante** se edita en el sitio, sin
  versión nueva, con su apunte de auditoría. Versionar lo que nadie tiene no protege a nadie.
- **RN-COM-22**: quien ya tiene el plan pasa a la versión nueva en su **primera renovación que
  caiga al menos 30 días naturales después de publicarla** (§104, aviso mínimo). Quien renueva
  antes renueva con la versión que tiene y pasa en la siguiente. Nadie elige fechas a mano.
- **RN-COM-23**: una versión que **solo favorece** al restaurante (baja el precio, sube alguna
  cuota, acorta algún plazo o sube el nivel, sin empeorar nada) no pide aceptación: se le avisa al
  publicarla y pasa según RN-COM-22. Una que **le perjudica en algo** (sube el precio, baja una
  cuota, alarga un plazo, baja el nivel o quita la prioridad o la vigilancia) pide su aceptación
  con el mismo mecanismo de las condiciones (RN-DAT-07, migración 75): aviso en Cuotly y por
  correo, y aceptar en su pantalla o registrarlo el equipo con fecha y contrato. Si un cambio
  favorece en una cosa y perjudica en otra, cuenta como que perjudica.
- **RN-COM-24 (opción A)**: si llega la renovación de RN-COM-22 y el restaurante **no ha aceptado**
  una versión que le perjudica, **sigue en la versión que aceptó**, que no se borra ni se cierra
  (§104, "se conserva la versión aceptada"). La pantalla del equipo lo marca como "en versión
  anterior" y el propietario decide qué hacer. Si acepta más tarde, pasa en su siguiente
  renovación. Nunca se le cobra una versión que no ha aceptado.
- **RN-COM-25**: pasar a una versión nueva **no reinicia la permanencia**. RN-COM-05 reinicia en un
  cambio **voluntario** de plan del restaurante; este lo hace el espacio.
- **RN-COM-26**: todos los restaurantes de una versión pasan juntos, cada uno en su renovación. No
  hay precios individuales (RN-COM-14): el único que se queda atrás es el de RN-COM-24, y por no
  aceptar, no por un precio pactado.
- **RN-COM-27**: archivar un plan, un servicio o una versión lo quita de las altas y de los cambios
  de plan nuevos, y nada más: quien lo tiene lo conserva hasta que pase a otro. Nunca se borra. Lo
  archivado sigue en el historial de versiones.
- **RN-COM-28**: una versión nueva **no reescribe hacia atrás**: los trabajos ya aceptados
  conservan las condiciones con las que se aceptaron (RN-COM-15, RN-COM-17,
  `accepted_start_sla_hours`), y el ciclo en curso se cobra y se consume con la versión con la
  que empezó.
- **RN-COM-29**: las mismas reglas valen para los servicios adicionales, Menú Diario incluido. Sus
  dos precios (RN-COM-08) son dos campos de la versión y cambian con ella.
- **RN-COM-30**: la comparativa de versiones (M55) enseña, además del texto de las condiciones, el
  precio y las cuotas de cada versión, y marca qué mejora y qué empeora para el restaurante.

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
- **RN-SLA-02**: duración = 48 h laborables (Básico, Impulso o establecimiento sin plan) / 24 h laborables (Impulso+, Premium y Premium+). Sale de `plans.start_sla_hours`.
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

Desde el 20/09/2026 esta tabla es el **valor por omisión**: un plan puede acortarla (RN-SLA-18).

- **RN-SLA-13**: se detiene al publicar.
- **RN-SLA-14**: se **pausa** durante bloqueos y pausas autorizadas, conservando el tiempo restante exacto.
- **RN-SLA-15**: avisos al 75 %, 90 % y 100 %.
- **RN-SLA-16**: el cliente ve rangos o fechas aproximadas. Propietario, administradores y responsable ven el contador exacto.
- **RN-SLA-17**: "Fuera de plazo" es una **condición calculada**, no un estado. Puede coexistir con En curso, Bloqueado o cualquier otro.
- **RN-SLA-18 (añadida 20/09/2026, decisión 61)**: **el plan puede acortar el plazo de realización**, y
  la tabla de RN-SLA-12 pasa a ser el **valor por omisión**, no el único. Vive en cuatro columnas de
  `plans` —una por categoría, como los cambios incluidos— y no en el nombre del plan, porque Cuotly
  es multiempresa.

  Los de Restavor, fijados por Bosco el 20/09/2026, y **solo bajan en Premium+**:

  | Categoría | Todos los planes | Premium+ | Lo que ve el cliente |
  |---|---:|---:|---|
  | Pequeño | 72 h | **48 h** | 1–3 días → **1–2 días** |
  | Fotográfico | 72 h | **48 h** | 1–3 días → **1–2 días** |
  | Mediano | 72 h | 72 h | 1–3 días (igual) |
  | Grande | 120 h | **96 h** | 3–5 días → **2–4 días** |

  **Lo que esto arregla de paso:** hoy un cambio pequeño y uno mediano tienen el mismo plazo, que
  nunca tuvo mucho sentido. Con estos números Premium+ tiene una escalera que sube con el tamaño del
  trabajo —48, 48, 72, 96— en vez de un escalón plano y otro muy alto.

  **El plazo se congela al aceptar**, en `jobs.execution_sla_hours`, exactamente como el de inicio
  (RN-COM-15): un cambio de plan **no reescribe hacia atrás** un trabajo ya aceptado, ni para
  acortarlo ni para alargarlo. Un trabajo aceptado antes de esta regla no tiene valor congelado y se
  mide con la tabla de RN-SLA-12, que es la que tenía el día que se aceptó.

  **No hace falta ninguna excepción para las fotografías**, que era la duda: el reloj de ejecución ya
  **se pausa durante los bloqueos** (RN-SLA-14), así que una sesión que espera a que el restaurante
  pueda emplatar no consume plazo mientras esté bloqueada. Lo que exige es bloquearla de verdad en
  vez de dejar el reloj corriendo.

  **Los avisos del 75 %, 90 % y 100 % (RN-SLA-15) se mueven solos**, porque son porcentajes del
  plazo: en un pequeño de Premium+ el primero salta a las 36 h laborables en vez de a las 54. No hay
  ningún umbral nuevo que decidir.

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
- **RN-REQ-05 (añadida 19/09/2026, decisión 49)**: al crear una solicitud, el restaurante elige su
  **prioridad** —**Alta · Media · Baja**— y **escribe por qué**. Los dos campos son **obligatorios**:
  así los dibuja el diseño definitivo móvil (página 63, "Nueva solicitud", los dos con asterisco), y
  el motivo cabe en **200 caracteres**.

  **Esto convive con el "Orden de importancia" (§ RN-PRI, migración 62) y no lo sustituye.** Son dos
  cosas distintas y hay que llamarlas distinto en pantalla, porque confundirlas es fácil:

  | | Prioridad (RN-REQ-05) | Orden de importancia (RN-PRI) |
  |---|---|---|
  | Qué es | Alta / Media / Baja | Un orden 1..N |
  | Cuándo se pone | Al crear la solicitud | Después, sobre lo que está pendiente |
  | Quién | **Cualquier** restaurante | Solo el plan que concede prioridad |
  | Qué dice | Cuánto le corre **esta** | Cuál va **antes que cuál** |

  Una etiqueta no dice cuál va antes entre dos "Media" —eso lo razonó Bosco el 10/09/2026 y sigue
  siendo verdad—; lo que el diseño añade es que el cliente pueda decir **cuánto le corre** cada
  solicitud, y **por qué**, sin depender del plan. La palabra "Prioridad" en las pantallas del equipo
  pasa a ser esta; al orden 1..N se le llama por su nombre, que ya es el que usa su propia pantalla.

- **RN-REQ-06 (añadida 19/09/2026, decisión 49)**: **la prioridad la pone el cliente y no es un
  compromiso de Cuotly.** No cambia plazos, no reordena la cola del equipo y no tiene nada que ver
  con la prioridad que concede el plan (RN-COM-03, que el cliente no ve). Es lo que el restaurante
  dice que le corre, y el equipo lo lee. Decirlo así en la pantalla evita la lectura de que marcar
  "Alta" adelanta el trabajo.

- **RN-REQ-07 (añadida 21/09/2026, decisión 64)**: la solicitud **enseña las subtareas y las
  evidencias de su trabajo, en solo lectura**.

  - **Solo cuando hay trabajo.** Las subtareas y las evidencias cuelgan del trabajo (§11, RN-JOB),
    que nace al aceptar la solicitud. Antes de aceptar no hay nada que enseñar, y eso se dice: no
    se pinta una lista vacía que haría pensar que el trabajo no lleva tareas.
  - **Se ven aquí, se marcan allí.** Ni una casilla se marca desde la solicitud, ni se sube una
    evidencia desde ella. Una casilla que se pudiera marcar en dos sitios acabaría marcada en uno
    y no en el otro; las evidencias se suben donde se hace el trabajo.
  - Quien no puede ver el trabajo **tampoco ve sus tareas aquí**: esto no abre ninguna puerta. Las
    filas salen de las mismas políticas que la pantalla del trabajo, y para el cliente siguen
    siendo organización interna del equipo (P7).

- **RN-REQ-08 (añadida 23/09/2026, decisión 73)**: **el propietario y los administradores del
  espacio pueden crear una solicitud en nombre del restaurante** cuando la pidió fuera de Cuotly
  (por teléfono, por correo, en persona). Es la pantalla M77 del diseño definitivo. Un trabajador
  no puede; el restaurante sigue usando su propio formulario (§9.1).

  - **Sin borrador.** Se crea y se envía en un paso: nace `received`, arranca T1 (RN-SLA-01) y
    queda el apunte de envío que lee el seguimiento del restaurante. Un borrador del equipo
    aparecería en el panel del restaurante como si lo estuviera escribiendo él.
  - **Constancia, como en la decisión 21.** Es obligatorio escribir **cómo y cuándo lo pidió el
    restaurante** (hasta 500 caracteres). La fila queda marcada (`requests.created_by_team`), la
    auditoría lleva `on_behalf_of_client` y el motivo, y los propietarios del restaurante (local y
    global del grupo) reciben el aviso `request_created_on_behalf`. El restaurante ve que la creó
    el Equipo de mantenimiento y cómo la pidió, **nunca quién** (P7): en su fila `created_by`
    queda vacío y quién fue lo dice la auditoría.
  - **La prioridad y su motivo son obligatorios** también aquí (RN-REQ-05): el equipo escribe lo
    que le dijo el restaurante.
  - **La categoría que elija el equipo sustituye a la IA.** Si la elige, es la propuesta
    (`classifications.source = 'team'`) y la solicitud pasa directa a validación interna, sin
    llamar a la IA. Si la deja vacía, la IA la clasifica como cualquier otra (RN-CLS-01). En los
    dos casos el restaurante no ve nada hasta que se valida (RN-CLS-03).
  - **La aceptación no cambia.** La propuesta la acepta el restaurante en Cuotly, como siempre:
    consumir cambios de su plan es decisión suya. Crearla en su nombre no consume nada. La única
    aceptación en su nombre sigue siendo la del presupuesto (decisión 21, §84).
  - **Los adjuntos** se suben compartidos con el restaurante: la solicitud es suya.
  - Pulsar dos veces **no crea dos solicitudes** (clave de idempotencia).

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

- **RN-EST-15 (añadida 19/09/2026, decisión 51)**: **el lado cliente tiene dos roles y siete
  permisos.** Los roles son **Propietario** y **Editor** (páginas 152 y 153 del diseño definitivo
  móvil). Los siete permisos, con el nombre que el diseño les da:

  | Permiso | Qué deja hacer | Columna |
  |---|---|---|
  | Crear solicitudes | Enviar solicitudes al equipo de mantenimiento | `create_requests` |
  | Editar menús | Pedir cambios en el menú diario | `edit_menus` |
  | Mensajes | Leer y enviar mensajes | `use_messages` |
  | Subir archivos | Adjuntar archivos en solicitudes y mensajes | `upload_files` |
  | Consultar informes | Ver los informes y datos del restaurante | `view_reports` |
  | Pagos y facturas | Ver pagos y facturas | `view_billing` *(ya existía)* |
  | Usuarios y accesos | Gestionar usuarios y permisos del restaurante | `manage_users` |

  **"Consultar informes" tiene historia y conviene saberla**, o alguien lo deshará: ese permiso
  **existió** —columna `establishment_permissions.view_reports` y su función, migración 85—, **Bosco
  lo quitó entero el 14/09/2026** (decisión 28c) y **lo devolvió el 19/09/2026** (decisión 52,
  migración 108) al elegir el diseño frente a su propia decisión anterior. Consecuencia que se puso
  por escrito antes de preguntarle y que es la parte que hay que tener presente: **un Editor nuevo
  nace sin ver informes** hasta que su Propietario le encienda la casilla. Al aplicar la 108 **nadie
  perdió un informe que ya veía**: se encendió a todos los Editores con acceso vivo.

  **Afinan hacia abajo, nunca hacia arriba.** El **Propietario los tiene todos y no se le pueden
  quitar** —"Acceso completo a todos los módulos", dice el diseño—, porque un restaurante cuyo
  propietario se quedara sin `manage_users` no podría volver a tocar sus accesos nunca. El que se
  configura es el **Editor**. Un permiso nuevo nace en `false`.

  **Una sola puerta**: `client_permission(establecimiento, permiso)` decide, y las funciones de
  negocio la llaman. Siete copias de la misma regla acabarían diciendo siete cosas.

- **RN-EST-16 (añadida 19/09/2026, decisión 51)**: **el rol Consulta desaparece del catálogo** y
  quien lo tuviera pasa a **Editor con todos los permisos apagados**, que hace exactamente lo mismo:
  leer —los informes incluidos, que no dependen de permiso (RN-REP-01)—. No se borra ninguna fila —CLAUDE.md no destruye registros de negocio— y nadie pierde acceso:
  cambia el nombre del rol y la manera de expresar lo que ya podía hacer.

- **RN-EST-17 (añadida 19/09/2026, decisión 51)**: **quién gestiona los accesos de un restaurante**:
  el **equipo de mantenimiento** (`manage_clients`, que es como se crea el panel — RN-PAN-10) y,
  dentro del panel, el **Propietario del restaurante**. Un Editor **no**, ni siquiera con permisos:
  `manage_users` le deja ver la pantalla y gestionar a los demás Editores, pero **no tocar al
  Propietario** — si pudiera, el permiso sería una manera de quedarse con el restaurante.

  El aviso del diseño —*"Solo el propietario puede invitar o retirar usuarios"*— está **dentro del
  panel del cliente** y habla de sus propios usuarios, no del equipo. Leerlo como que el equipo
  tampoco puede dejaría el panel sin poder crearse nunca: no habría nadie que pudiera ser el
  primero.

- **RN-EST-14 (añadida 19/09/2026, decisión 48)**: **Gestión tiene nueve bloques**, en este orden:
  **Datos · Plan y servicios · Pagos · Usuarios · Archivos · Integraciones · Notas internas ·
  Copias de seguridad · Estado del servicio**.

  Sale del diseño definitivo móvil, que **se contradice a sí mismo**: su página 27 enumera Gestión
  entera (Datos · Plan y servicios · Pagos · Usuarios · Archivos · Integraciones · Notas internas)
  y su página 58 enseña otra lista (Usuarios y accesos · Configuración · Archivos · Copias de
  seguridad). **Manda la 27**, porque es la que enumera la pestaña entera; la 58 solo dibuja una de
  sus subpestañas y llama "Configuración" a lo que la 27 llama Datos.

  Las dos que se añaden **ya existían y vivían en otro sitio**: las **notas internas** (§16,
  RN-MSG-04 y RN-EST-13; migraciones 66 y 67) se leían desde la conversación, y las **copias de
  seguridad** (§38, RN-BCK; migración 100) desde el cuerpo de la ficha. Esto no cambia ninguna
  regla suya: cambia dónde se entra. En particular **RN-EST-13 sigue intacta** —los clientes nunca
  ven las notas internas—, y que ahora cuelguen de Gestión no las acerca ni un paso al cliente: la
  pestaña Gestión es del equipo.

  **"Estado del servicio" se queda aunque el diseño no lo dibuje.** Es donde se archiva un
  restaurante, se reactiva y se registra la baja que llegó por teléfono (M84, M47), y eso tiene que
  vivir en algún sitio; va el último a propósito, porque son las tres acciones que no se hacen
  todos los días.

  **El hueco de cada bloque en la dirección no cambia** (`?vista=gestion&bloque=archivos`): un
  `slug` que cambia rompe los enlaces que alguien tenga guardados.

- **RN-EST-18 (añadida 21/09/2026, decisión 62)**: **un restaurante tiene una foto**, la que lo
  identifica en una lista. Una, no una galería.

  - La **sube el equipo o el cliente**, y la ven los dos: es la cara de su propio restaurante, no
    material interno del equipo.
  - Vive en los **archivos del espacio** (§18, RN-ARC), porque un restaurante es de un espacio. No
    necesita sitio propio, a diferencia de la foto de perfil de una persona (RN-GLO-09), que no es
    de ningún espacio.
  - **Sustituirla no borra la anterior**: los archivos de Cuotly se versionan (RN-ARC-03) y los
    registros de negocio no se borran físicamente. La foto vigente es la última versión.
  - **Sin foto se enseña sin foto.** Un restaurante recién creado no tiene ninguna, y eso no es un
    error ni un aviso: no se pinta un marco vacío esperándola, que haría pensar que algo falló
    (CA-20).
  - Cambiarla es un cambio de datos del restaurante y **deja auditoría** como los demás (§21.2).

- **RN-EST-19 (añadida 21/09/2026, decisión 63)**: un restaurante puede tener un **responsable**,
  que es alguien del **equipo del espacio**, y **puede no tenerlo**.

  - **No se llama supervisor.** "Supervisor" ya significa otra cosa en Cuotly —una relación
    Administrador–Trabajador (§14, RN-SUP)— y son cosas distintas: aquella enlaza dos personas,
    esta enlaza a una persona con un restaurante.
  - **Sin responsable es un estado normal**, no un hueco que rellenar: la pantalla dice "sin
    responsable" y no empuja a asignar a nadie. Ninguna regla del servidor —un aviso, un reparto,
    un plazo, un informe— puede depender de que ese campo esté relleno.
  - **No concede ni quita permisos.** Quién puede hacer qué sigue saliendo de las capacidades del
    espacio (§13); ser responsable de un restaurante es una atribución, no una llave. En
    particular, no da acceso a un restaurante que no se tuviera ya.
  - Solo puede serlo alguien con **pertenencia activa** al espacio. Si esa persona sale del
    espacio, el restaurante se queda **sin responsable** —no se reasigna solo a nadie— y se dice.
  - Asignarlo y quitarlo **deja auditoría** con actor, valor anterior y valor nuevo (§21.2).
- **RN-EST-20 (añadida 23/09/2026, decisión 74)**: **los grupos se crean, se renombran y un
  restaurante se puede mover de grupo.**

  - **Crear**: el propietario y los administradores del espacio (`manage_clients`) pueden crear un
    grupo **vacío**, con nombre (obligatorio) y descripción (opcional). Crear dos veces con la misma
    clave crea uno solo.
  - **Renombrar y describir**: libre, mismas personas. No cambia ningún acceso.
  - **Mover un restaurante de grupo**: lo hace el equipo (`manage_clients`) a **cualquier grupo del
    espacio**, o el **propietario del restaurante** (propietario local o propietario global de su
    grupo) **solo a un grupo del que también sea propietario global**.
  - **El grupo de destino gana acceso en el acto**: sus propietarios globales y sus editores de grupo
    entran por el grupo (RN-EST-03, RN-EST-04), sin conceder nada.
  - **Quien entraba por el grupo de origen** y no sigue entrando por otra vía **se queda como Editor**
    del restaurante **o pierde el acceso**, según elija quien hace el cambio. Quien se queda como
    Editor conserva los permisos operativos (crear solicitudes, editar menús, mensajes, subir archivos
    y consultar informes) y no los de propietario (pagos y facturas, usuarios y accesos, editar
    datos); el nuevo propietario los ajusta (RN-EST-15).
  - **Los accesos del propio restaurante** (propietario local, Editores del restaurante) no cambian.
  - El restaurante se lleva sus archivos y sus informes individuales; los **consolidados** del grupo
    de origen se quedan con él. Mover al grupo en el que ya está no hace nada. Todo deja auditoría
    con actor, valor anterior y valor nuevo (§21.2).

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
- **RN-FIN-09**: en Fase 1 Cuotly **no emite facturas**: permite adjuntar la factura oficial emitida externamente para su descarga. La numeración fiscal está en el bloque legal pendiente. *(Aclarado el 16/09/2026, decisión 40: el diseño definitivo enseña facturas emitidas por Cuotly porque el agente que las prepara vivirá **dentro** del producto. Eso es el estado final, no un cambio de esta regla: las pantallas se construyen con su sitio hecho, pero hasta que llegue el bloque legal —paso 4 del orden acordado— ninguna inventa número ni serie, y lo emitido sigue siendo el cobro con referencia bancaria de RN-SUB-05.)*

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
- **RN-NOT-06 (añadida 21/09/2026, decisión 65)**: cada persona elige, **para cada espacio**, si
  recibe los avisos **al momento** o en un **resumen diario**.

  - **Al momento** es lo de siempre y el valor por omisión: quien no ha tocado nada lo tiene así.
  - **El resumen diario sale a partir de las 08:00 de la zona horaria del espacio** y recoge las
    24 h anteriores. La hora es fija: no se configura, porque una hora por persona multiplica los
    casos y no resuelve nada que no resuelva ya elegir entre las dos frecuencias.

    **"A partir de" y no "a las", y el motivo importa.** El resumen lo construye un barrido de la
    cola, y la cola no corre continuamente: la invoca el cron de Vercel, que en el plan actual pasa
    **dos veces al día**. Si el barrido exigiera que fueran las ocho en punto, en Madrid y en
    verano no coincidiría nunca —la cola pasa a las 09:00 y a las 21:00 locales— y el resumen
    **no se enviaría**, sin dar ningún error, medio año. Así que sale en la **primera pasada del
    día que ocurra a las 08:00 o después**, y la clave única de un resumen por día impide que
    salgan dos.

    Cuanto más a menudo corra la cola, más cerca de las ocho llega. Con una pasada por hora
    llegaría a las 08:00 en punto. Prometer esa hora exacta depende de la infraestructura, así que
    **la pantalla dice "a partir de las 08:00"**, que es verdad con cualquier frecuencia.
  - **La elección es por espacio, no por persona.** Los avisos son de un espacio y la hora de
    corte es la de ese espacio; quien trabaja en dos recibe dos resúmenes, cada uno en su mañana.
  - **Agrupa el correo y el push, nunca el aviso dentro de la aplicación.** La campana no
    interrumpe a nadie, y si también se retrasara, quien eligió resumen diario abriría Cuotly y no
    vería nada de lo que ha pasado hoy.
  - **Un aviso obligatorio (RN-NOT-03) no espera al resumen: sale al momento.** Si esperara,
    "no se puede desactivar" sería falso en la práctica — se apagaría hasta la mañana siguiente.
  - **Un resumen por persona, espacio y día.** Repetir el barrido no manda dos correos, y un día
    sin nada que contar **no genera resumen**: un correo que dice "no ha pasado nada" es ruido.
  - **El horario de recepción no existe**, y es una decisión, no un olvido: elegir entre las dos
    frecuencias ya resuelve el "no me molestéis a deshora", y una franja añadiría cambios de hora,
    husos ajenos y qué hacer con lo acumulado al cerrarse. Si hace falta, será otra decisión.

**Ajustes del espacio tiene ocho pestañas** (añadido 19/09/2026, decisión 50): **General · Horarios ·
Impuestos · Integraciones · Suscripción · Seguridad · Auditoría · Notificaciones**, como las dibuja
el diseño definitivo móvil. Antes era una sola columna con todas las secciones seguidas.

**No cambia ninguna regla**: las preferencias de aviso siguen siendo RN-NOT-02 y RN-NOT-03, el
calendario RN-CLK, el IVA RN-FIN-08. Cambia por dónde se llega a cada cosa.

**Suscripción y Auditoría conservan su dirección** (`/ajustes/suscripcion` y `/ajustes/auditoria`),
que ya eran páginas propias: hay avisos **ya emitidos** que apuntan ahí —el de almacenamiento al
100 %, entre otros— y RN-NOT-04 dice que un aviso abre el elemento exacto. Un enlace profundo que
deja de funcionar es un aviso roto, no un detalle de navegación. Las otras seis viajan en `?vista=`.

**La frecuencia de aviso** ("Al momento / Resumen diario") se decidió el 21/09/2026 y es RN-NOT-06.
El **horario de recepción** queda fuera a propósito, con su motivo escrito en esa misma regla.

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
- **RN-ARC-10 (añadida 19/09/2026, decisión 48)**: la ficha del restaurante dice **cuánto ocupa ese
  restaurante**, en el bloque Archivos de Gestión, donde lo pone el diseño definitivo móvil (página
  50: *"Almacenamiento (Magariños) 6,4 GB"*). Tres cosas, todas deliberadas:

  1. **Es informativo, no una cuota.** El límite sigue siendo **uno y del espacio** (RN-SUB-13,
     RN-ARC-09): no hay almacenamiento incluido por restaurante, no hay umbral por restaurante y
     pasarse no lo decide este número. Un restaurante **no se queda sin sitio**, y la pantalla lo
     dice al lado con esas palabras. **No repite ahí el total del espacio**: ese número vive en la
     suscripción (`cuotly_space_usage()`, que solo puede leer quien gestiona el espacio) y la ficha
     enlaza allí en vez de traerse una segunda copia que un día diría otra cosa.
  2. **Es la suma entera del restaurante, o no es nada.** Se calcula en el servidor sumando los
     bytes de todas las versiones de sus archivos, **sin filtrar por quién mira**. La RLS de
     `files` enseña a cada persona lo que le toca —un trabajador no ve la facturación (RN-ARC-05)—
     y una suma filtrada le daría un número más pequeño **llamándolo "lo que ocupa el
     restaurante"**, que es una cifra falsa dicha con seguridad. Por eso el número **solo lo
     recibe quien puede ver todos los archivos del establecimiento** (`manage_requests`), y a
     quien no, **no se le enseña un número**: ni parcial ni cero, se le dice el motivo (CLAUDE.md
     MUST NOT). El cliente tampoco lo ve: es un dato del equipo, donde el diseño lo pone.
  3. **No se inventa ningún precio.** Pasarse de lo incluido se presupuesta aparte (decisión 38);
     aquí no hay precio por GB ni lo habrá por esta vía.

---

## 20. Navegación e interfaz

### 20.1 Selector de contexto
**Se entra siempre al Inicio global** (§36), se tenga un contexto o diez: la raíz **es** esa
pantalla. El selector de contexto no desaparece por eso —es la parte de abajo del Inicio
(RN-GLO-03)—, y sigue enseñando nombre, tipo, rol y la acción que toca. Bosco ve además la entrada
a Administración de Cuotly, la primera. Existe una acción persistente "Cambiar de espacio", y desde
dentro de cualquier contexto se vuelve con "Volver al inicio de Cuotly".

> **Esto se reescribió el 16/09/2026 (decisión 42).** Hasta ese día decía "con un solo contexto
> accesible se entra directamente", y esa frase es incompatible con §36: quien tiene un solo espacio
> —que es casi todo el mundo— no vería nunca el Inicio global, donde están sus mensajes de todas
> partes, sus solicitudes, su cuenta y la ayuda. Se construyó sin tocar la raíz, se preguntó, y
> Bosco decidió que se entre siempre al Inicio global. El coste, asumido: un clic más para quien
> tiene un solo contexto.

### 20.2 Menú del espacio (escritorio)
Inicio · Restaurantes · Solicitudes · Trabajos · Tareas · Menú Diario · Mensajes · Calendario ·
Finanzas · Informes · Equipo · Planes y servicios · **Agente Cuotly (Próximamente)** · Ajustes.

En Fase 1, Menú Diario e Informes muestran su estructura con el estado vacío correspondiente.

### 20.3 Navegación móvil (5 destinos, con Crear en el centro)

**Una sola barra, la misma para todos los roles y en todos los contextos:**

**Inicio · Restaurantes · Crear (+) · Mensajes · Más**

El **Crear** central va elevado y **no es un destino**: es la acción de §20.5, cuyas opciones
dependen del rol y del contexto. Como cualquier otra puerta, el servidor vuelve a comprobar el
permiso al ejecutar (CLAUDE.md: ocultar un botón no es un control de acceso).

Los otros cuatro sí son destinos, y **a dónde llevan depende de dónde estés**, que es lo que
sustituye a la barra por rol:

| Destino | En un espacio de mantenimiento | En un panel de restaurante | Fuera de los dos |
| --- | --- | --- | --- |
| Inicio | el inicio del espacio | el inicio del panel | el Inicio global (§36) |
| Restaurantes | los restaurantes del espacio | los suyos, en el Inicio global | los suyos, en el Inicio global |
| Mensajes | la bandeja del espacio | la del panel | la bandeja global (§36) |
| Más | el resto de su superficie | el resto de la suya | el resto de la global |

> **Esto se reescribió el 19/09/2026 (decisión 47).** Hasta ese día había **cuatro barras
> distintas**, una por rol, y era lo único que el diseño definitivo móvil (`Cuotly_movil.pdf`,
> 157 páginas) cambia de verdad respecto al de escritorio: pone la misma barra en las 157 vistas,
> sea quien sea quien mira y esté donde esté.
>
> El motivo que lo hace defendible, y no solo una preferencia visual: **una barra que cambia de
> forma según quién entra no se aprende**. Con la misma en todas partes, el pulgar sabe dónde está
> Mensajes sin mirar, y lo que cambia es a dónde lleva, que es lo que de verdad depende del
> contexto. El coste, asumido: un trabajador pierde el acceso directo a Tareas desde la barra y lo
> alcanza por Más.
>
> **Lo que NO cambia:** que son cinco y no seis. Una barra inferior con más de cinco deja de ser
> pulsable con el pulgar, y eso ya estaba fijado.

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
- **HU-01** · Como persona, quiero entrar en Cuotly con correo y contraseña y verificación obligatoria, por la única puerta que me corresponda —una solicitud de acceso aprobada o una invitación—, para acceder a Cuotly. *(Reescrita el 16/09/2026 por la decisión 41: RN-ACC-01 retira el registro abierto y RN-ACC-10 el inicio de sesión con Google.)*
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

- **RN-INT-10 (añadida 20/09/2026, decisión 60)**: Cuotly **vigila las reseñas de Google** del
  establecimiento, y esa vigilancia **la concede el plan**: `plans.watches_reviews`. Es lo que
  Bosco quiso añadirle a Premium+ además del informe, el 20/09/2026.

  **Sale de la conexión que ya existe.** Google Business Profile ya está construido —el OAuth, la
  sincronización, la pantalla, los siete estados— y hoy solo trae rendimiento: impresiones, clics a
  la web, llamadas, cómo llegar y reservas. **No trae las reseñas.** Esta regla añade las reseñas a
  la misma conexión: ni credencial nueva, ni proveedor nuevo, ni pantalla nueva de conectar.

  **Una reseña no es un punto de métrica y no se guarda como tal.** Tiene texto, autor, puntuación
  y fecha, y hay que poder señalar **una** y decir "esta". Vive en su propia tabla, con `space_id`
  y RLS como cualquier otra (CLAUDE.md), y con la marca de solo lectura en Modo soporte y en
  espacio archivado.

  **El autor de una reseña es un cliente del restaurante, no alguien del equipo**, así que aquí no
  hay nada que tapar con privilegios de columna (P7): el nombre que Google publica es público y
  esconderlo dejaría al restaurante sin saber a quién contesta. Lo que sí se respeta es lo de
  siempre: **ni una columna con clave ajena a `profiles`** que el restaurante pueda leer.

  **Si el plan no la concede, la reseña no se descarga**, no es que se descargue y se esconda. Y eso
  **no rompe el principio de la escalera** de RN-REP-15 —"los cinco niveles dicen la verdad sobre el
  mismo mes"—, porque aquel principio habla de **contar lo que pasó con el servicio de
  mantenimiento**. Esto es un servicio distinto que se compra o no se compra, como Menú Diario: no
  es un dato del restaurante que se le oculte, es un trabajo que no se está haciendo. Queda escrito
  aquí porque la confusión entre las dos cosas es fácil y sería grave.

- **RN-INT-11 (añadida 20/09/2026, decisión 60)**: **una reseña de 3 estrellas o menos es una reseña
  baja**, y salta. El umbral lo fijó Bosco el 20/09/2026 sobre las otras dos que se le propusieron,
  2 y 4: *un 3 en Google ya es un cliente descontento que se tomó la molestia de escribir, y es el
  que todavía se puede recuperar; esperar al 2 es llegar cuando el daño ya está hecho.*

  **No es una constante suelta escondida en una consulta**: es una función propia, citable y con
  una migración por delante el día que cambie. El día que otro espacio quiera su propio número,
  será una columna; hoy sería inventar una preferencia que nadie ha pedido.

  **Ni la puntuación ni el número de reseñas generan una oportunidad automática.** Las nueve reglas
  de oportunidades son las de la decisión 26 y **no se amplía ninguna por la puerta de atrás**: una
  reseña baja avisa a personas, que deciden. Inventar aquí un umbral de "reputación en riesgo"
  sería exactamente lo que CLAUDE.md prohíbe.

- **RN-INT-12 (añadida 20/09/2026, decisión 60)**: **quién se entera de una reseña nueva**, decidido
  por Bosco el 20/09/2026: **el equipo siempre; el restaurante solo si es baja** (RN-INT-11).

  La razón es que un aviso que llega todos los días deja de leerse. El equipo vigila y responde, que
  es el trabajo que se está vendiendo; al restaurante se le interrumpe **solo cuando hay algo que
  atender**. Las demás las tiene igual en su pantalla y en su informe (RN-REP-15), que es donde se
  leen las cosas que no son urgentes.

  Los dos avisos son de **lectura**, no obligatorios (RN-NOT-03): no son seguridad ni pérdida de
  acceso. Y como todo lo demás, **llegar dos veces la misma reseña no genera dos avisos**: la
  reseña es única por su identificador de Google dentro del establecimiento, y volver a
  sincronizar no la duplica ni vuelve a avisar.

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
antigüedad, y "periodo insuficiente" (§178) se lee como menos de una semana con dato (una medición,en PageSpeed): es una lectura aplicada y confirmada, anotada como decisión 25a. Las
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
- **RN-INT-09 (añadida 19/09/2026, decisión 48)**: **"Cuotly Insights" es el nombre del resumen
  propio, no una fuente**. Las páginas 41 y 44 del diseño definitivo móvil lo dibujan como una
  tarjeta más junto a Google Analytics 4 y Search Console, y Bosco lo decidió el 19/09/2026: es el
  nombre que el diseño le da a **lo que Cuotly ya calcula** a partir de las fuentes conectadas —la
  sección `summary`, que existe desde el Hito 14—. **No hay recogida propia**, ni telemetría, ni
  retención nueva, ni aviso legal que redactar; entenderlo de la otra manera sería inventarse un
  producto entero a partir de una etiqueta en una pantalla.

  Consecuencias de que no sea una conexión, y son las que hay que respetar al pintarlo:

  - **No tiene cuenta que autorizar ni botón de conectar.** Aparece donde el diseño lo pone —entre
    las fuentes— pero diciendo lo que es: la lectura propia de Cuotly sobre lo demás.
  - **Su estado se deriva** (RN-DAT-05): está **activo** cuando alguna fuente ha traído datos alguna
    vez, y **sin nada que resumir** cuando ninguna lo ha hecho. Pintarlo siempre "Activa", como
    sugiere el diseño, afirmaría que hay un resumen cuando puede no haber ni un dato detrás
    (CLAUDE.md MUST NOT).
  - **Su fecha es la del dato más reciente que resume**, no una suya: no sincroniza nada.
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
- **RN-OPP-08**: §101 · **Básico ninguna** ("detección interna"), **Impulso, Impulso+ y Premium las
  básicas aprobadas**, **Premium+ también las avanzadas** (decisión 39, punto 4: las cantidades por
  ciclo de las fichas son descripción comercial, no un tope que el servidor cuente). **Avanzada** es la
  que **cruza dos fuentes** y **básica** la que
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

---

## 29. Informes — Fase 3 (RN-REP)

Transcripción con número de §89 a §95 de la especificación maestra, con el mismo criterio que §25,
§26, §27 y §28: cada regla con su test, ninguna regla nueva. La diferencia con las oportunidades:
aquí la maestra **sí** dice los estados, el flujo y las salidas; lo que no dice es **quién recibe el
correo**, **cuándo es "se acerca la fecha"**, **qué ve el restaurante de un informe que todavía no se
le ha enviado** y **si el PDF se archiva**. Esas cuatro se leen aquí y se anotan como lectura
confirmada por Bosco (decisión 28 de `docs/DECISIONES.md`), no se inventan reglas nuevas. **Cuáles son las
secciones** no hace falta leerlo: lo dibuja la maqueta 10.04 de `docs/diseno/`, y son las suyas.
Servidor y dominio en la migración 85 y en `src/core/reports.ts` (Fase 3, Hito 16).

- **RN-REP-01**: hay **tres familias de informe** (§89): **operación** (solicitudes, trabajos, tareas,
  tiempos, consumos y menús), **finanzas** (ingresos, cobros, impagos y renovaciones) y **rendimiento
  digital** (web, Google y fuentes conectadas). Un informe es de **un restaurante** o **consolidado
  del espacio**; §89 da las dos formas ("informes globales e individuales"). Quién ve qué: propietario y
  administradores del espacio, todo; el **propietario global** del grupo, el informe de **cada
  establecimiento suyo**; el **propietario local**, el de su establecimiento; el
  **Editor** y el **Consulta**, igual: **lo ven todos los que trabajan en ese restaurante**, con el
  acceso vigente. §89 decía que Consulta necesitaba permiso de su propietario y así se implementó
  primero, con un permiso fino por persona; **Bosco lo enmendó el 14/09/2026** (decisión 28) y ese
  permiso se quitó entero. El **diseño definitivo móvil** (página 153) volvió a dibujar la casilla
  "Consultar informes", y **Bosco resolvió la contradicción el 19/09/2026 a favor del diseño**
  (decisión 52, migración 108): el permiso vuelve y es el séptimo de RN-EST-15. Así que la regla de
  hoy es **el acceso vigente Y la casilla**, con el Propietario y el grupo (§14.1) siempre dentro.
  Un Editor nuevo nace sin ella. Lo que sigue intacto de la decisión 28 es todo lo demás: a quién
  **llega** el informe (28d), la aprobación (28a), los avisos de §95 (28b) y el PDF guardado
  (28e). Un informe **consolidado no se comparte con ningún restaurante**, y eso
  **incluye al propietario global del grupo**: mezcla datos de varios y no hay cliente al que
  pertenezca. Esta regla decía las dos cosas a la vez —que el propietario global veía "el
  consolidado de su grupo" y que un consolidado no se comparte con nadie— y **Bosco resolvió la
  contradicción el 14/09/2026** (decisión 30) a favor de la segunda. Un consolidado es **del
  espacio**, no de un grupo: el CHECK `reports_scope` de la migración 85 no admite un informe sin
  restaurante que tenga grupo, así que "el consolidado de su grupo" tampoco existía como fila. El **trabajador no ve la pantalla de informes
  de un restaurante** —lo que §90 le da es el suyo personal—, pero si está autorizado en él **sí
  recibe el informe enviado**, porque trabaja ahí (RN-REP-11).
- **RN-REP-02**: el **informe personal del trabajador** (§90) lleva carga actual, trabajos realizados,
  pendientes, cumplimiento de plazos, tiempos medios, bloqueos, correcciones y **puntos históricos
  realizados separados de la carga actual**. **No lleva finanzas.** El trabajador ve el suyo; las
  **comparaciones** entre trabajadores solo las ven propietario y administradores y se **segmentan**
  como manda §55 (RN-ASG-17) —plan, tipo de cambio, volumen, dificultad, cumplimiento de plazos,
  correcciones atribuibles y periodo comparable—, y **no existe ranking público**. No es una tabla:
  se calcula de los libros inmutables cuando se pide.
- **RN-REP-03**: los **indicadores operativos** son los **diez** de §91, ni uno más: solicitudes
  recibidas/aceptadas/rechazadas/canceladas · trabajos iniciados/completados/pendientes · cumplimiento
  de inicio · cumplimiento de ejecución · tiempo medio de inicio y de finalización · trabajos
  bloqueados y duración bloqueada · correcciones solicitadas · consumo de cambios, fotografías y
  actualizaciones · menús publicados · menús fuera de garantía. Se calculan **en el servidor**
  (CLAUDE.md) y sobre los libros inmutables, no sobre contadores: el cumplimiento y los tiempos medios
  usan el **reloj contractual** (`src/core/business-clock.ts`, RN-CLK), así que los calcula
  `src/core/reports.ts` y no SQL, igual que los umbrales de T2 y T3 en la cola.
- **RN-REP-04**: la **analítica digital** de un informe (§92) son las métricas que ya están importadas
  (RN-INT-07): un informe **no llama a ninguna API**, lee `metric_points`. Por eso un informe se puede
  generar de un periodo cerrado meses después y sale lo mismo.
- **RN-REP-05**: **el informe guarda las cifras de todas sus secciones y quien lo mira elige cuáles
  ver** (decisión 29). Generar una versión calcula las cifras de las **tres familias**, las haya
  marcado el equipo o no: apagar una sección es decidir qué lleva el PDF, no ordenar que no se
  calcule, y si no se guardara, verla después obligaría a regenerar —que es otra versión con otras
  cifras—. Lo que **sí** depende de lo que marque el equipo es lo que el equipo escribe o elige: las
  **notas** de una sección apagada no viajan dentro de la versión (RN-REP-13) y las **oportunidades**
  solo entran si su sección está incluida (§99). Quien abre un informe —el equipo o el restaurante—
  **enciende y apaga secciones** sobre la versión guardada, y se abre con lo que decidió el equipo;
  es estado de pantalla, no escribe nada y no alcanza nada que la versión no trajera dentro. **El PDF
  y el CSV salen con lo que eligió el equipo**, que es lo que se envió. Los **filtros** de §93 son
  ocho —periodo, restaurante, grupo, plan, trabajador, tipo de cambio, estado y servicio— y son de la
  **biblioteca**, que ofrece los **seis** de la maqueta 10.01 (restaurante, grupo, plan, periodo,
  categoría y estado); **no se "vuelven a aplicar" al regenerar un informe**, porque un informe ya no
  se genera filtrado. El filtro por **trabajador** no se le ofrece nunca al restaurante: le diría
  quién del equipo hizo qué (CLAUDE.md). El **periodo** de un informe es el que elige la
  persona; por omisión, el **último mes natural cerrado** (que es lo que dibuja la vista 10.01), no la
  ventana de 28 días de la analítica (decisión 25b): dentro de un informe, las cifras digitales son
  las **del periodo del informe**.
- **RN-REP-06**: las **salidas** son las **cuatro** de §93: **pantalla, PDF, CSV y correo programado**.
  PDF y CSV se generan **desde la versión** del informe y no se guardan como archivo aparte: la
  versión es el original y las dos salidas son una representación suya, así que dos descargas del
  mismo informe dan lo mismo. **El informe automático por correo no necesita IA** (§93): ninguna de
  las cuatro salidas llama al clasificador.
- **RN-REP-07**: **conservación histórica** (§94, RN-INT-07): los datos ya importados se conservan
  aunque cambie el plan o se desconecte la fuente, cada cifra dice **su fecha de última
  sincronización** y **nunca se presenta información desactualizada como actual**. Dentro de un
  informe eso se sostiene con la **versión**: una vez generada, guarda las cifras y su antigüedad, y
  desconectar la fuente después no la cambia. Cuando una sección no tiene dato, dice **cuál de los
  cinco motivos de §178** es, igual que las pantallas del Hito 14.
- **RN-REP-08**: los estados son los **seis** de §95: `preparing` · `pending_review` · `approved` ·
  `scheduled` · `sent` · `archived`. Quién mueve cada uno: preparar y editar, cualquiera del equipo
  con acceso al restaurante; **aprobar, programar, enviar y archivar**, el propietario y los
  administradores **con "Aprobar informes"** (`space_memberships.can_approve_reports`, la misma
  capacidad del Hito 15 y de §97). El **trabajador no entra en los informes de un restaurante**: §89
  no se los da, y lo que §90 le da es su informe personal, que es otra cosa y no pasa por estos
  estados. Mover al mismo estado dos
  veces no escribe dos apuntes (RN-DAT-09), y aprobar, programar o enviar dos veces produce **un solo
  efecto** (CA-17).
- **RN-REP-09**: las **secciones** de un informe son las **cinco de la maqueta 10.04** —resumen
  ejecutivo, operación, rendimiento digital, oportunidades y anexos y evidencias— más **finanzas**,
  que esa maqueta no dibuja porque dibuja un informe de operación pero que §89 da como familia. **No
  dependen de la familia**: la misma maqueta dibuja un informe de operación con rendimiento digital
  dentro, así que la familia dice de qué va el informe y las secciones dicen qué lleva. El **flujo**
  son los siete pasos de §95, en este orden: (1) Cuotly genera los datos objetivos **de las tres
  familias**, marcadas o no (RN-REP-05, decisión 29), (2) prepara el borrador —con el resumen ejecutivo, la sección de su familia y los
  anexos marcados, y las oportunidades **nunca** marcadas (§99)—, (3) **marca las secciones que
  requieren criterio** —resumen ejecutivo y oportunidades: lo que una persona escribe o elige; las
  demás son cifras y no piden opinión—, (4) revisa quien tiene "Aprobar informes", (5) **selecciona,
  edita y ordena** las secciones, (6) lo aprobado se inserta, y (7) se genera el PDF y se programa o
  se envía. Requerir criterio **no** es entrar apagada: el resumen ejecutivo entra marcado y lo
  escribe quien revisa. Las secciones se guardan con su **orden** y su **inclusión**, y editarlas
  después de aprobar **devuelve el informe a revisión**: un informe aprobado es un texto concreto, no
  una carpeta que sigue cambiando.
- **RN-REP-10**: §95 · **un informe solo objetivo puede enviarse automáticamente** —si ninguna sección
  incluida requiere criterio, se puede programar sin aprobación—, y **si hay oportunidades
  pendientes, no se envía hasta que se aprueben**: un informe que incluye la sección de oportunidades
  y cuyo restaurante tiene oportunidades de ese periodo en `detected`, `recommended` o `under_review`
  **no sale**; el envío se detiene y el informe vuelve a `pending_review` con el motivo. Esto lo
  comprueba el servidor en el momento de enviar, no la pantalla al pintar el botón: una oportunidad
  puede detectarse **después** de aprobar el informe.
- **RN-REP-11**: §95 · **Cuotly avisa cuando se acerca la fecha programada**. El aviso
  (`report_schedule_due_soon`) sale **24 horas antes** de la fecha de envío, una sola vez por informe y
  fecha (CA-17), y va a quien puede pararlo: propietario y administradores con "Aprobar informes". El
  envío al restaurante es el segundo aviso (`report_sent`), que es lo que §93 llama "correo
  programado", y va a **todos los que trabajan en ese restaurante, por los dos lados** —sus personas y
  su grupo, los trabajadores autorizados en él y quien lleva la cartera— con el acceso vigente
  (decisión 28d). **Ninguna dirección va escrita en el código**: los destinatarios se calculan, porque
  Cuotly es multiempresa y una dirección fija mandaría los informes de otro espacio a Restavor. No es una lista
  escrita a mano.
- **RN-REP-12**: §95 · **cada versión se conserva**. `report_versions` es un **libro inmutable**: cada
  generación escribe una fila con las cifras, las secciones y su orden, quién la generó y cuándo, y
  nadie la edita ni la borra (CLAUDE.md). Lo que se envía es **una versión concreta**, y el envío
  queda en `report_deliveries` con su destinatario y su fecha. Regenerar un informe **no pisa** la
  versión anterior: añade la siguiente.
- **RN-REP-13**: lo que el restaurante ve de un informe **no lleva ninguna identidad del equipo** (P7):
  `reports` y `report_versions` tienen el `select` concedido **columna a columna**, y quién lo
  preparó, aprobó o envió sale de `audit_log`. El restaurante ve un informe **cuando se le ha
  enviado**: `preparing`, `pending_review`, `approved` y `scheduled` son conversación interna del
  equipo, y lo sostiene la política de RLS, no que la pantalla no lo pinte. Las **secciones en
  edición** (`report_sections`) no las ve nunca: ahí se le deja fuera de la **fila**, como en `tasks`.
  Y **dentro de la versión** que sí se le envía no viajan las **notas** de las secciones que el
  equipo apagó: son su preparación, el PDF no las pinta, pero estaban dentro del `snapshot` y desde
  ahí se leían. Las **cifras** de esas secciones sí viajan y el restaurante puede encenderlas
  (RN-REP-05): son datos suyos, no redacción del equipo.
- **RN-REP-14**: toda decisión sobre un informe deja **evento de estado y apunte de auditoría** con
  actor, fecha, valor anterior, valor nuevo y motivo cuando proceda (familia `report`, visible con
  `manage_clients`, §21.2). Lo que escribe el proceso de la cola —el envío programado y el aviso de
  las 24 h— deja el actor nulo, como la detección de oportunidades.

- **RN-REP-15 (añadida 20/09/2026, decisión 56)**: **el plan decide el nivel de informe**, y son
  **cinco**. Lo dibuja la página 97 del diseño definitivo móvil ("Versiones de plan"), donde
  "Informes" aparece en la comparativa junto a "Prioridad" y a los cambios incluidos, con una línea
  que dice "Se mejora el nivel de informes a Avanzado": **es un atributo del plan y se versiona como
  los demás**. Vive en `plans.report_level` y **no se deduce del nombre del plan**, porque Cuotly es
  multiempresa y otro espacio pondrá los niveles donde quiera.

  **El principio de la escalera (fijado el 20/09/2026, decisión 58).** Los cinco niveles dicen la
  **verdad sobre el mismo mes**; ninguno esconde una cifra mala ni el historial del restaurante. Lo
  que sube con el plan **no es la información, es el análisis**: qué tan bien fue, con qué se
  compara y qué conviene hacer después. Esto no es una frase bonita, es la regla que resuelve las
  dudas del día de mañana — ante "¿esto va en Básico?", la pregunta es si es **lo que pasó** (va) o
  **una valoración de lo que pasó** (sube de nivel).

  Consecuencia directa: **lo que el restaurante pidió, lo que se le entregó y lo que gastó de su
  bolsa está en los cinco niveles**, con su descripción y sus fechas (RN-REP-18, RN-REP-20). Esconder
  la descripción de un cambio que un Básico ha **pagado aparte** sería cobrarle por ver su propia
  factura, y dejaría su informe casi en blanco — que es peor producto que uno corto pero útil.

  Los cinco niveles y lo que **añade** cada uno sobre el anterior —ninguno quita—:

  | | `basic` | `standard` | `standard_plus` | `advanced` | `complete` |
  |---|:--:|:--:|:--:|:--:|:--:|
  | | Básico | Impulso | Impulso+ | Premium | Premium+ |
  | Portada y **Lo esencial** (RN-REP-19) | ✓ | ✓ | ✓ | ✓ | ✓ |
  | Resumen ejecutivo | ✓ | ✓ | ✓ | ✓ | ✓ |
  | **Lo que ha pasado este mes**, con la ficha de cada cambio (RN-REP-18) | ✓ | ✓ | ✓ | ✓ | ✓ |
  | **Consumo por categoría** (RN-REP-20) | ✓ | ✓ | ✓ | ✓ | ✓ |
  | Operación · cumplimiento de plazos | — | ✓ | ✓ | ✓ | ✓ |
  | Operación · tiempos medios de inicio y entrega | — | ✓ | ✓ | ✓ | ✓ |
  | Operación · bloqueos, correcciones y Menú Diario | — | — | ✓ | ✓ | ✓ |
  | Operación · los tiempos **de cada cambio**, uno a uno (RN-REP-21) | — | — | — | — | ✓ |
  | Comparación con el periodo anterior (RN-REP-17) | — | Lo esencial | todas las cifras | ✓ | ✓ |
  | Rendimiento digital | — | — | cifras de cabecera | + desgloses | + evolución dentro del mes (RN-REP-22) |
  | Oportunidades | — | — | — | ✓ | ✓ |
  | Finanzas | — | — | — | ✓ | ✓ |
  | Anexos y evidencias | — | — | — | ✓ | ✓ |
  | Comparación con el **mismo mes del año anterior** (RN-REP-23) | — | — | — | — | ✓ |
  | El **efecto de cada cambio** publicado (RN-REP-25) | — | — | — | — | ✓ |
  | Qué pasó con las **oportunidades del informe anterior** (RN-REP-24) | — | — | — | — | ✓ |
  | **Aprovechamiento del plan** en la permanencia (RN-REP-26) | — | — | — | — | ✓ |
  | **Reseñas de Google**, si el plan las vigila (RN-INT-10) | — | — | — | — | ✓ |

  **Qué cambió respecto a la primera versión de esta regla (20/09/2026, decisión 58).** El día que se
  escribió, "el detalle cambio a cambio" era exclusivo de `complete`. Con el relato del mes ya
  construido eso dejó de encajar, porque **el relato es el detalle**: si va en los cinco, el detalle
  va en los cinco. Se separan por tanto dos cosas que se estaban llamando igual:

  - **El qué** —descripción, fechas de inicio y fin, tipo de cambio consumido— va en **los cinco**.
  - **Los tiempos de cada cambio uno a uno** —cuánto tardó en arrancar cada uno, cuánto estuvo
    bloqueado, cuántas correcciones necesitó— siguen siendo de `complete`. Eso sí es análisis.

  **Por qué Básico sigue siendo el más corto**, aunque ya no esté casi vacío: no lleva plazos, ni
  comparación, ni Rendimiento digital, ni Oportunidades, ni Finanzas, ni Anexos. Tiene su mes
  contado y su bolsa; no tiene ninguna lectura de cómo fue.

  **Consecuencia técnica de lo anterior, y es un cambio respecto a la migración 111:** la sección
  `operation` pasa a empezar en `standard`, no en `basic`. Antes empezaba en `basic` porque el relato
  del mes no existía y sin ella el informe no tenía nada; hoy el mes se cuenta en `month_activity` y
  la sección de Operación es solo lo que Básico no paga —plazos, tiempos, bloqueos—. Un informe
  `basic` lleva por tanto **resumen ejecutivo y "Lo que ha pasado este mes"**, y su portada se queda
  sin "Lo esencial" porque no tiene ninguna cifra de cabecera que enseñar; el bloque **no se dibuja
  vacío** (RN-REP-19).

  **El nivel es una barrera, no una sugerencia.** Una sección que el nivel no permite **no se puede
  incluir**, ni al preparar el borrador ni marcándola a mano después: si bastara con la casilla, un
  Básico recibiría lo que no paga en cuanto alguien se despistara (CLAUDE.md — ocultar no es
  controlar). Solo aplica a los informes **de un restaurante**: un consolidado es del espacio y no lo
  recibe ningún cliente (decisión 30).

  **Un informe ya enviado no cambia de nivel.** Si el restaurante sube de plan mañana, lo que se le
  envió sigue siendo lo que se le envió: la versión es el original (RN-REP-12) y el nivel se aplica
  al prepararlo.

- **RN-REP-16 (añadida 20/09/2026, decisión 56)**: **un informe que lleva Finanzas solo lo ve quien
  tenga "Pagos y facturas"**. No es que se le enseñe el informe sin esa sección: **no ve el informe**.
  Bosco, 20/09/2026: *"no verá ese informe a no ser que le den permiso"*.

  Es coherente con RN-FIN-07, que ya dice que la facturación del restaurante depende de un permiso
  por persona (`view_billing`, RN-EST-15) y no del plan: dos Editores del mismo restaurante pueden
  ver cosas distintas. Y es lo prudente: recortar el PDF por secciones según quién lo abra
  significaría que el mismo informe es dos documentos, y el informe es **uno** —la versión guardada,
  RN-REP-12—.

  Consecuencia práctica al preparar: si el informe de un restaurante lleva Finanzas, **solo lo
  alcanzan las personas con ese permiso**, y quien no lo tenga no lo ve en su panel ni le llega su
  aviso. Si se quiere que lo vea todo el restaurante, la sección de Finanzas va en un informe aparte.

- **RN-REP-17 (añadida 20/09/2026, decisión 57)**: **cada cifra se compara con la del periodo
  anterior**. Bosco, 20/09/2026, preguntado si la comparación va en las tres cifras de cabecera o en
  todas: *"Sí, en todas las cifras"*.

  **Qué es "el periodo anterior"**, y son dos reglas porque el equipo elige las fechas del informe:

  - Si el periodo es un **mes natural entero** —del día 1 al último—, el anterior es el **mes natural
    anterior entero**: septiembre contra agosto del 1 al 31. Aquí se aceptan 30 días contra 31
    porque lo que el restaurante lee es "agosto", y recortarle el día 1 para cuadrar el tamaño sería
    llamar agosto a algo que no lo es: una mentira callada es peor que un 3 % de diferencia
    declarada.
  - **Cualquier otro periodo** se compara con **otros tantos días pegados detrás**: uno del 15 al 28
    de septiembre, con el 1 al 14. Comparar catorce días contra un mes diría cualquier cosa.

  En los dos casos el periodo anterior **termina el día antes de que este empiece**: ni se solapan ni
  dejan hueco.

  **Se calcula, no se deduce.** Las cifras del periodo anterior salen de preguntar los mismos datos
  otra vez, no de una versión guardada: una versión vieja se generó con otras secciones y con las
  fuentes en otro estado. Cuesta el doble de consultas y se acepta a sabiendas — un informe se
  genera una vez y se lee muchas, y un número suelto no informa de nada: "5.921 visitas" no dice si
  son muchas o pocas hasta que hay con qué compararlo.

  **Cada cifra se empareja con la suya por sección, métrica y dimensión.** Sin la dimensión,
  "Sesiones · móvil" se compararía con "Sesiones · escritorio" y el porcentaje sería inventado.

  **Lo que no hay no se rellena con un cero** (CLAUDE.md): una cifra que no existía en el periodo
  anterior se dice **"sin periodo anterior"**, porque un 0 % afirmaría que el mes pasado no hubo
  nada, que es otra cosa. Un cero que **sí** es un dato —el mes pasado se publicaron cero menús— se
  conserva como cero. Y una cifra que solo existe en el periodo anterior **no se añade** al informe:
  el informe cuenta este periodo, y una fila con solo pasado sería una cifra fantasma.

  **La comparación depende del nivel** (RN-REP-15): `basic` no la lleva, `standard` la lleva en las
  cifras de **Lo esencial**, y de `standard_plus` en adelante en **todas**. Un informe de nivel
  `basic` por tanto **ni siquiera pide el periodo anterior**: no es que se calcule y se esconda.

  **Si el periodo anterior falla, el informe sale igual, sin comparación.** Quedarse sin informe
  porque no se pudo leer el mes pasado sería la peor de las dos opciones: la comparación es contexto,
  no el dato.

  **La variación dice la dirección, no si está bien.** Que las incidencias suban un 20 % es malo y
  que las visitas suban un 20 % es bueno; decidirlo cifra a cifra sería una lista de juicios
  inventada (CLAUDE.md). Quien juzga es la persona que escribe el resumen ejecutivo (§93), así que la
  variación se pinta igual en los dos sentidos. Y los cinco casos se dicen distinto, porque lo son:
  sin comparación (no se pinta nada), **"sin periodo anterior"**, **"el periodo anterior fue 0"** —un
  porcentaje desde cero es infinito—, **"igual que el periodo anterior"** y la variación con su
  signo, redondeada a entero.

- **RN-REP-18 (añadida 20/09/2026, decisión 57)**: el informe lleva **"Lo que ha pasado este mes"**:
  el relato ordenado por fecha de todo lo que ocurrió en el periodo. Bosco, 20/09/2026: *"el informe
  tiene que ser un resumen de todo lo que ha pasado en el mes"*.

  Es una sección del catálogo (`month_activity`) y entra **en los cinco niveles**, Básico incluido:
  es justo lo que un Básico —que no incluye ningún cambio (RN-COM-01)— sí tiene que poder leer.

  **La sección tiene dos mitades, y son distintas a propósito** (ampliado el 20/09/2026, decisión
  58):

  **1 · Los cambios, con su ficha.** Un cambio no es una línea de registro: es lo que el restaurante
  pidió y pagó, así que se cuenta entero. Cada uno lleva:

  ```
  4 ago   Cambiar el precio del menú                      Cambio pequeño
          Cambiar 20 € de pescado por 25 €
          Empezado el 4 ago · Entregado el 6 ago
  ```

  - **El título** es el resumen que validó el equipo (`validated_summary`); si no lo hay, el código
    del cambio. **La descripción** es lo que escribió el restaurante (`description`). Las dos son
    texto que **ya se le muestra hoy** (migración 27, privilegios de columna): esto no le enseña
    nada nuevo, lo reúne.
  - **El tipo de cambio** que consumió —pequeño, fotografía, mediano, grande—, o **"presupuestado
    aparte"** cuando fue a presupuesto y no gastó bolsa (RN-CON-03).
  - **Las fechas de inicio y de fin**, y los dos casos en que no las hay:
    - si el cambio **está en marcha** cuando se genera el informe, donde iría la fecha de fin se dice
      **"En proceso"**;
    - si está **aceptado pero sin empezar**, donde iría la de inicio se dice **"Pendiente de
      empezar"**.

    Ninguno de los dos es un hueco ni una fecha inventada: son dos estados reales y se nombran
    (CLAUDE.md).
  - Un cambio **cancelado** lo dice, con su fecha.

  Esta mitad va en **los cinco niveles** (RN-REP-15): es lo que pasó, no una valoración de lo que
  pasó.

  **2 · Lo demás, una línea por cosa y con su fecha**: solicitudes rechazadas, correcciones que pidió
  el restaurante, menús del día publicados, archivos compartidos con él, y los cobros y pagos **solo
  si el informe lleva Finanzas** — porque si no, un informe de cualquier nivel estaría enseñando
  dinero a quien no tiene "Pagos y facturas" (RN-REP-16, RN-EST-15).

  **Un cambio sale en su ficha y no además como línea suelta.** Sin esta regla, el mismo cambio
  aparecería cuatro veces —solicitud recibida, solicitud aceptada, cambio publicado, cambio
  entregado— y el relato de un mes movido sería ilegible. Todo lo que le pasó a un cambio se cuenta
  dentro de su ficha.

  **Tres cosas que NO entran y podrían parecer que sí.** Las **incidencias** de soporte: son del
  espacio a Cuotly (§131, RN-SOP), no del restaurante, y contarlas aquí sería contarle las de otro.
  Las **correcciones por error del equipo**: se corrigen sin que al restaurante le cueste nada
  (RN-COR-07), y ponerlas en su relato es contarle nuestra cocina. Los **archivos internos**: son del
  equipo y el cliente no los ve ni debe saber que existen (RN-ARC-04). Tampoco un **borrador de
  solicitud** que nunca envió, ni un **pago revertido**, que no pasó (RN-FIN-04).

  **Ninguna entrada lleva identidad del equipo** (P7, RN-REP-13): dice qué pasó y cuándo, nunca
  quién lo hizo. "Cambio entregado", no "entregado por Marta".

  **Se lee del libro, no se redacta.** Las entradas son filas con su clave y su fecha; la frase en
  español la pone la pantalla o el PDF desde `src/i18n/es.ts`, igual que las oportunidades (§96).
  Cuotly no escribe el relato: lo ordena.

- **RN-REP-19 (añadida 20/09/2026, decisión 57)**: **cómo se ve el informe por dentro**. El PDF
  sigue la maqueta aprobada por Bosco el 20/09/2026 y tiene este orden, que no es decorativo:

  1. **Portada**: el restaurante, el periodo en letra y la fecha de generación.
  2. **"Lo esencial"** — *"si solo lees una página, es esta"*: **como mucho tres cifras**, cada una
     con su variación respecto al periodo anterior (RN-REP-17). Se toman, por este orden y solo de
     las secciones que entran: cambios entregados y cumplimiento de plazo (Operación), visitas
     (Rendimiento digital), ingresos (Finanzas). **Si una no hay, la tarjeta no está** — no se
     rellena con un cero ni con una barra (CLAUDE.md, §178).
  3. **Resumen ejecutivo**: el texto que escribió una persona del equipo, con la línea que lo dice.
     Cuotly no lo redacta (§93).
  4. **Índice** de lo que trae ese informe concreto.
  5. **Una página por sección**, en el orden que fijó el equipo, con su tabla de concepto / valor /
     comparación.
  6. **Anexos**: el estado de cada fuente y su última sincronización (§94), que es lo que permite
     leer un hueco sin llamar a nadie.
  7. **Pie con paginación** en todas las páginas.

  **La tarjeta de "clics en reservas" del primer boceto no se construye**: las reservas y el delivery
  **no se monitorizan** (decisión fijada en `CLAUDE.md`), así que esa cifra no existe y ponerla sería
  inventarla.

- **RN-REP-20 (añadida 20/09/2026, decisión 58)**: el informe dice **cuántos cambios de cada
  categoría se han consumido y cuántos incluye el plan**. Bosco, 20/09/2026: *"prefiero que ahí
  pongas por separado cuántos cambios pequeños ha consumido, cuántos medianos, cuántos grandes y
  cuántos fotográficos"*.

  Se escribe así, y **siempre las cuatro categorías**, el 0 de 0 incluido: esa línea informa, porque
  dice lo que el plan del restaurante **no** le da (RN-COM-02: solo Premium+ incluye un cambio
  grande).

  ```
  Cambios pequeños      2 de 5 incluidos
  Fotografías           3 de 6 incluidas
  Cambios medianos      1 de 1 incluido
  Cambios grandes       1 de 0 incluidos · 1 presupuestado aparte
  ```

  **El "1 de 0" no es un error de cuentas, y por eso lleva coletilla.** Un cambio presupuestado
  aparte **no consume bolsa** (RN-CON-03, RN-COM-07): no deja apunte en el libro de consumos. De
  modo que el primer número y el segundo salen de sitios distintos —los trabajos presupuestados del
  periodo, y la bolsa del ciclo— y sin decirlo el restaurante leería que se ha pasado de su plan
  cuando lo que hizo fue comprar uno aparte. Bosco eligió esta forma el 20/09/2026 sobre las otras
  dos que se le propusieron.

  **De dónde sale cada número**, que es lo que evita que alguien los junte mal mañana:

  - **Consumidos**: los apuntes de `consumption_entries` del **periodo del informe**. Es el libro
    inmutable (CLAUDE.md), no un contador.
  - **Incluidos**: la instantánea del **ciclo vigente al final del periodo** (`consumption_cycles`),
    no el plan en vivo: un ciclo ya creado no se mueve si el plan cambia después (RN-CON-05). Sin
    plan vigente no hay línea de incluidos, y se dice.
  - **Presupuestados aparte**: los trabajos del periodo con presupuesto (`jobs.quote_id`), contados
    por categoría.

  **Dónde vive:** a la cabeza de "Lo que ha pasado este mes" (RN-REP-18), no como sección aparte. Es
  la misma pregunta —qué ha pasado con mis cambios este mes— y así hereda su nivel sin que haya que
  gobernar una sección más. El **cumplimiento de plazos**, que en la primera maqueta ocupaba ese
  sitio, baja a la tabla de Operación, donde empieza en `standard`.


- **RN-REP-21 (añadida 20/09/2026, decisión 60)**: en `complete`, Operación lleva **los tiempos de
  cada cambio, uno a uno**. Es lo que la tabla de RN-REP-15 le prometía a Premium+ desde el día que
  se escribió y no existía: hasta hoy Premium+ recibía exactamente el mismo informe que Premium.

  De cada cambio del periodo **que tiene trabajo** se dice:

  - **cuánto tardó en arrancar** desde que se aceptó, en **reloj laboral** (RN-CLK), y **si cumplió
    el plazo con el que se aceptó** —`accepted_start_sla_hours`, no el del plan de hoy (RN-COM-15)—;
  - **cuánto estuvo bloqueado**, sumando sus bloqueos (`blocks`), y **por qué tipo de motivo**
    —información del cliente, incidencia externa, pausa autorizada, retención financiera—, que son
    los cuatro de `blocks.reason_type` y ninguno nombra a nadie;
  - **cuánto tardó de principio a fin**, de `started_at` a `completed_at`, también en reloj laboral;
  - **cuántas correcciones** necesitó, que ya sale en su ficha (RN-REP-18) y aquí se repite en la
    misma fila para poder leerla de un vistazo.

  **Un cambio sin trabajo todavía no tiene tiempos, y se dice en vez de dejarlo en blanco**: "en
  análisis" si nadie lo ha aceptado, "pendiente de empezar" si está aceptado y sin arrancar. Es el
  mismo criterio de RN-REP-18 y de CLAUDE.md: si no hay dato, se dice cuál es el motivo.

  **Esto no le enseña la cocina al restaurante** (P7, RN-REP-13): dice cuánto tardó **su** cambio,
  nunca quién lo hizo, ni a cuántos más estaba asignada esa persona, ni cómo se repartió el equipo.
  La fila no lleva ni una columna con clave ajena a `profiles`.

  **Se calcula donde se calcula todo lo demás**: en `src/core/`, desde el mismo
  `report_operation_dataset()` que ya trae los trabajos, sus bloqueos y sus `timer_events`. **No
  hace falta ninguna consulta nueva**, y eso no es una casualidad: el dataset se diseñó devolviendo
  filas en vez de cifras justamente para que una lectura nueva no obligue a tocar el servidor.

- **RN-REP-22 (añadida 20/09/2026, decisión 60)**: en `complete`, Rendimiento digital lleva además
  la **evolución dentro del mes**: en vez de una cifra por métrica, la **serie por semanas**.

  **Las semanas son bloques de 7 días contados desde el primer día del periodo**, no semanas
  naturales. La razón es del negocio, no técnica: un bloque de 7 días contiene **exactamente un
  lunes, un martes y un sábado**, y en un restaurante el fin de semana pesa tanto que una semana
  natural recortada por el borde del mes compara cosas distintas y parece una caída.

  **El resto se dibuja, pero marcado.** Un mes de 31 días deja 3 días sueltos al final. Se enseñan
  con sus fechas y con la etiqueta **"periodo parcial"**, porque una barra corta al lado de cuatro
  barras llenas se lee como un desplome y no lo es. Ni se esconde ni se reparte: se dice.

  **No todas las métricas se pueden partir igual**, y confundirlo sería inventarse un dato:

  - las que se **suman** —visitas, sesiones, clics, impresiones— se suman dentro de cada bloque;
  - las que son **proporción o posición** —CTR, posición media, puntuaciones de PageSpeed— se
    **promedian**, y el promedio de un bloque sin datos **no es cero, es "sin datos"**;
  - las que vienen ya **desglosadas por dimensión** —por página, por consulta, por dispositivo— **no
    entran en la serie**: una serie semanal de 40 consultas no es una lectura, es una hoja de
    cálculo, y el desglose ya lo tiene `advanced`.

- **RN-REP-23 (añadida 20/09/2026, decisión 60)**: en `complete`, cada cifra se compara **también
  con el mismo mes del año anterior**, además de con el periodo anterior (RN-REP-17).

  **Es la comparación que de verdad significa algo en hostelería.** Septiembre contra agosto es en
  buena parte temporada: un descenso puede ser que el negocio vaya peor o que agosto sea agosto.
  Septiembre contra el septiembre pasado responde a la pregunta que el restaurante se hace de
  verdad, que es si va mejor que el año pasado.

  **Cómo se saca el periodo de hace un año**, con la misma forma de dos reglas que `previousPeriod`
  (RN-REP-17): si el periodo es un **mes natural completo**, el mismo mes natural completo del año
  anterior —febrero contra febrero, con sus 28 o 29 días, sin recortar ninguno—; si no lo es, las
  mismas fechas con el año restado, y si el día no existe en ese año —29 de febrero— el último día
  de ese mes.

  **Se reutiliza la maquinaria de RN-REP-17 entera**: es una tercera llamada al mismo cálculo de
  cifras, con los mismos cinco casos de variación (sin comparación, sin periodo anterior, el
  anterior fue 0, igual, y el porcentaje con su signo). **La variación sigue sin juzgar**: que algo
  suba un 20 % no se pinta como bueno ni como malo, por la misma razón que en RN-REP-17.

  **Un restaurante que no llevaba un año con nosotros no tiene con qué compararse, y eso se dice**
  —"sin periodo anterior"—, no se deja la casilla vacía ni se compara contra cero. Y como en
  RN-REP-17, **si falla, el informe sale igual sin esa comparación**: es contexto, no el dato.

- **RN-REP-24 (añadida 20/09/2026, decisión 60)**: en `complete`, el informe dice **qué ha pasado
  con las oportunidades del informe anterior**.

  Premium ya recibe oportunidades (RN-REP-15); lo que añade Premium+ es **cerrar el círculo**. Un
  informe que cada mes propone cosas y nunca dice qué fue de las del mes pasado se lee como un
  folleto. Uno que las persigue se lee como un seguimiento, que es lo que se está vendiendo.

  Se toman las oportunidades que entraron en **la última versión enviada** del informe de ese
  establecimiento —la anterior a esta, no la que se está generando— y se dice en qué estado están
  **hoy**, agrupadas en cuatro lecturas, que es como las lee un restaurante:

  - **Hecha** → `implemented`.
  - **En marcha** → `in_progress`.
  - **Sigue abierta** → `approved_for_report`, `detected`, `recommended`, `under_review`.
  - **Ya no aplica** → `no_longer_applicable` y `discarded`.

  **No se enseña el motivo interno del descarte.** `discard_reason` lo escribe el equipo para el
  equipo y puede decir cualquier cosa; "ya no aplica" es toda la verdad que el restaurante necesita
  y la única que no arrastra conversación interna a un PDF que se reenvía por correo (P7).

  **Si no hay informe anterior enviado, la sección no se dibuja.** Un bloque que dice "no hay nada
  que seguir" en el primer informe de un restaurante es ruido, no información.

- **RN-REP-25 (añadida 20/09/2026, decisión 60)**: en `complete`, el informe dice **qué pasó con las
  cifras después de cada cambio publicado**. Es lo que convierte el informe en la respuesta a la
  única pregunta que un restaurante se hace sobre lo que paga: si sirvió de algo.

  De cada cambio **publicado** dentro del periodo se comparan las métricas sumables de los **14 días
  naturales anteriores** con las de los **14 posteriores**. **La ventana la fijó Bosco el 20/09/2026**
  (decisión 60) sobre las otras dos que se le propusieron, 7 y 28: catorce días cubren **dos fines de
  semana completos a cada lado**, así que un sábado flojo no mueve la lectura, y caben dentro del mes
  para casi todos los cambios.

  **El día de la publicación no entra en ninguna de las dos ventanas.** Es un día partido —unas horas
  antes del cambio y otras después— y meterlo en cualquiera de los dos lados ensucia los dos.

  **Se dice lo que pasó, nunca que lo causó el cambio.** "Después de este cambio, las visitas pasaron
  de 1.240 a 1.480" es verdad; "este cambio trajo 240 visitas" no se sabe y no se escribe. Cuotly no
  tiene forma de aislar una causa y **fingirla sería exactamente lo que CLAUDE.md prohíbe**.

  Tres casos en los que **no se pinta número y se dice el motivo**:

  - **Ventana incompleta** → el cambio se publicó tan cerca del final del periodo que los 14 días
    posteriores todavía no han pasado, o tan cerca del alta del restaurante que no hay 14 días
    antes. Se dice *"aún sin medir"*, y su efecto aparecerá en el informe del mes siguiente.
  - **Sin datos suficientes** → la fuente no cubre esos días (no estaba conectada, o falló). Se dice
    con el mismo vocabulario de RN-INT-07.
  - **Otro cambio en la misma ventana** → si dentro de los 14 días posteriores se publicó otro
    cambio, **se dice**, y las dos filas lo llevan escrito. Sin esa advertencia el restaurante
    atribuiría a uno lo que hicieron dos, que es la manera más fácil de mentir con datos ciertos.

- **RN-REP-26 (añadida 20/09/2026, decisión 60)**: en `complete`, el informe dice **cuánto está
  aprovechando el restaurante el plan que paga**, a lo largo de su permanencia y no solo del mes.

  RN-REP-20 ya dice lo del mes —2 de 5 pequeños—. Esto es la otra mitad: **de los ciclos cumplidos
  de su permanencia vigente** (`plan_commitments`), cuántos cambios incluidos ha usado y **cuántos
  dejó sin usar**, por categoría. Un restaurante que paga 399 € y gasta dos cambios pequeños al mes
  de los seis que tiene está tirando dinero, y decírselo es más honesto —y a la larga mejor negocio—
  que dejar que lo descubra el día que se plantea irse.

  **Los ciclos no se prorratean ni se acumulan.** Cada ciclo es su propia bolsa (RN-CON-05) y lo que
  no se gastó en agosto no se puede gastar en septiembre: la línea cuenta ciclo a ciclo y suma
  cuántos quedaron sin usar, nunca presenta un saldo acumulado que no existe.

  **El ciclo en curso no cuenta**, porque todavía puede gastarse: solo entran los ciclos cerrados
  dentro de la permanencia. Si no hay ninguno cerrado todavía, **la sección no se dibuja**.

  **No lleva ninguna recomendación automática.** Dice el hecho; si hay que sugerir bajar de plan o
  aprovecharlo mejor, lo escribe una persona en el resumen ejecutivo (§93), que es donde este
  producto pone los juicios.

Lo que este apartado **no** trae, dicho en claro: no hay informe **generado por IA** ni resumen
redactado (§93: "el informe automático por correo no necesita IA"), no hay plantilla de informe
configurable por espacio, y no hay envío a una dirección escrita a mano —el correo va a usuarios de
Cuotly, que es de quien se sabe si puede ver el informe—. La **numeración fiscal**, la exportación
masiva y la conservación legal siguen siendo del bloque legal aplazado (CLAUDE.md).

---

## 30. La plataforma: solicitud de espacio, aprobación y alta — Fase 4 (RN-PLA)

Hasta aquí, todo el PRD ocurre **dentro** de un espacio de mantenimiento. Este apartado es el primero
que ocurre **antes** de que el espacio exista: alguien pide uno, Cuotly lo revisa y, si lo aprueba, lo
crea. Es lo que convierte a Cuotly en multiempresa de verdad — hoy los espacios se crean a mano.

Sale de §10 (solicitud de creación de espacio), §167 (quién decide en la plataforma) y §4.4 (la
prueba empieza al aprobar). Donde §10 calla, las lecturas están confirmadas por Bosco como
**decisión 31**.

- **RN-PLA-01**: una **solicitud de creación de espacio** lleva los **nueve campos** de §10 —nombre del
  negocio, responsable, correo, teléfono, número estimado de establecimientos, número estimado de
  usuarios internos, uso previsto, plan **Pro o Agency**, y datos fiscales básicos— y **seis estados**:
  `draft` · `submitted` · `in_review` · `needs_information` · `approved` · `rejected`. Es la **primera
  tabla del proyecto que no pertenece a ningún espacio**: nace antes que él, así que no lleva
  `space_id`. El barrido de invariantes de RLS la va a señalar por eso, y se **clasifica con su motivo
  escrito** — no se relaja el barrido. Sí lleva RLS: quien la escribió ve la suya, y la plataforma las
  ve todas.
- **RN-PLA-02**: la envía **una persona ya registrada en Cuotly**, no un formulario público, así que
  no hace falta abrir un `insert` a `anon`; abrirlo sería una superficie de abuso sin dueño y
  dejaría la solicitud sin persona a la que entregarle el espacio al aprobarla. El argumento se
  escribió cuando §7.2 de la maestra dejaba que cualquiera se registrara —correo verificado, Google
  o Apple—; desde la **decisión 41** ya no se puede (RN-ACC-01), y quien envía esta solicitud ha
  entrado por una de las dos puertas de §37. No cambia de sentido: se refuerza, porque ahora el
  formulario público de acceso es el único sitio del producto donde escribe alguien sin sesión, y es
  otro (RN-ACC-12). El **borrador es suyo y solo suyo**: nadie de
  la plataforma lo ve hasta que se envía, igual que el borrador de solicitud del restaurante
  (RN-MSG-10). La maestra no decía quién la envía; **Bosco lo fijó el 15/09/2026** (decisión 31):
  "cuando se registran, después rellenan un formulario básico y tienen que esperar a que
  info@restavor.com les acepte". Primero la cuenta, luego la solicitud, luego la aprobación.
- **RN-PLA-03**: los seis estados se mueven por una **tabla de transiciones**, como los informes
  (RN-REP-08) y las oportunidades (RN-OPP-05), y no por comparaciones sueltas: `draft → submitted` y
  `needs_information → submitted` los mueve **el solicitante**; `submitted → in_review`,
  `→ needs_information`, `→ approved` y `→ rejected` los mueve **la plataforma**. `approved` y
  `rejected` son **finales**. Lo comprueba el servidor: que la pantalla solo pinte el botón correcto
  no es un control de acceso.
- **RN-PLA-04**: quién decide, según §167: **Bosco siempre**; un **Administrador de Cuotly, solo si
  recibe el permiso**. La tabla `platform_roles` existe desde la Fase 1 con `role = 'cuotly_admin'` y
  **sin permisos finos**, y §167 los concede por separado —aprobar espacios, gestionar suscripciones,
  Modo soporte—, así que se añaden como **capacidades de plataforma**, igual que
  `space_memberships.can_approve_reports` hace dentro de un espacio. Nombrar Administrador de Cuotly
  es de Bosco y de nadie más (§167).
- **RN-PLA-05**: **aprobar es una sola operación**, y hace cuatro cosas: crea el espacio, hace
  **propietario** al solicitante, **arranca la prueba de 7 días** del plan que eligió (§4.4: "la
  prueba comienza cuando Bosco aprueba y se crea el espacio") y deja evento y auditoría. Va en
  **transacción con clave de idempotencia** (CLAUDE.md): pulsar dos veces no crea dos espacios.
- **RN-PLA-06**: **rechazar exige motivo** (§10 dice "Rechazada con motivo") y **"Necesita
  información" exige decir qué falta**. Las dos son frases que escribe una persona, así que se
  guardan y se le enseñan al solicitante — un estado sin motivo deja a alguien mirando una pared.
- **RN-PLA-07**: el solicitante ve **el estado de su solicitud y el motivo**, y **no ve quién la
  revisó**. Es el mismo principio que P7 aplicado un piso más arriba: lo que importa es la decisión,
  no qué persona de Cuotly la tomó. Quién decidió sale de `audit_log`, como siempre. §10 no lo
  decía; confirmado por Bosco (decisión 31).
- **RN-PLA-08**: toda decisión sobre una solicitud deja **evento de estado y apunte de auditoría** con
  actor, fecha, valor anterior, valor nuevo y motivo (CLAUDE.md). `audit_log.space_id` **ya es
  anulable**, así que los apuntes anteriores a la aprobación lo llevan a `null`; el de la creación del
  espacio ya lleva el espacio nuevo.
- **RN-PLA-09**: la regla antiabuso de §4.4 —**una sola prueba gratuita por persona o negocio**— se
  comprueba **en el servidor, por los dos lados**. Por **persona**: la misma cuenta (§7.1). Por
  **negocio**, desde la decisión 38 (16/09/2026, migración 95): el **mismo NIF** —comparado sin
  espacios, guiones ni mayúsculas— **o el mismo dominio de correo**, del correo de la solicitud o del
  de la cuenta que la escribe, **salvo los dominios públicos** (Gmail, Hotmail, Outlook…, y los
  `example.*` reservados), que no identifican a ningún negocio. `approve_space_request()` rechaza el
  choque con un motivo que dice cuál es (persona, NIF o dominio) y con qué solicitud aprobada, y la
  solicitud **no cambia de estado sola**: rechazarla, con su motivo, sigue siendo de Cuotly
  (RN-PLA-06). El panel enseña los choques **antes** de aprobar (`space_request_trial_conflicts()`,
  solo plataforma). Hasta la migración 95 la comprobación por negocio no existía y no se fingía:
  era la pendiente 19.

Lo que este apartado **no** trae, dicho en claro: **no** trae el cobro, ni los límites de Pro y
Agency, ni el impago, ni el cambio de plan — eso es el Hito 18 (§4.1 a §4.7). **No** trae el
asistente de onboarding de §9, que es el Hito 20: aprobar crea el espacio vacío y con su
propietario, y el asistente que lo rellena viene después. **No** trae el panel de Administración de
§128 ni Modo soporte de §129, que son el Hito 19 — y con ellos llega la entrada **Administración de
Cuotly** del selector de contexto (§8), que aquí no tendría adónde llevar. Y **no** trae nada del bloque legal: los datos
fiscales se guardan como los escribe quien los escribe, sin validación fiscal ni numeración, que
siguen aplazadas (§170.1).

## 31. La suscripción de Cuotly: Pro, Agency, prueba, cobro manual e impago — Fase 4 (RN-SUB)

Todo lo que el PRD dice de dinero hasta aquí es lo que un espacio le cobra a **sus** restaurantes
(§17, RN-FIN). Este apartado es la otra cara: lo que el **propietario del espacio le paga a
Cuotly** por usarlo (§4.2.1 de la maestra: "los propietarios de espacios pagan a Bosco"). Es el
mismo problema con otro pagador, y se resuelve con las mismas piezas: un libro inmutable de apuntes,
un estado derivado y ninguna autoridad en el cliente.

Sale de §4.1 a §4.7 de la maestra. Donde §4 calla, las lecturas las confirmó Bosco el 15/09/2026
como **decisión 32** de `docs/DECISIONES.md`; ninguna se ha inventado como regla nueva. Cuatro puntos
siguen **aplazados a propósito** y aquí solo tienen placeholder: "uso razonable" (pendiente 17), el
precio del almacenamiento adicional (18), qué identifica a un negocio (19) y el bloque legal (20).

- **RN-SUB-01**: los **dos planes** son los de §4.1 y §4.2, y su catálogo vive **una sola vez** a
  cada lado de la frontera —`cuotly_plan_terms()` en SQL y `CUOTLY_PLAN_TERMS` en `src/core`—
  vigilado por `listas-compartidas.test.ts`: **Pro**, 149 € + IVA al mes, 5 establecimientos activos
  y 5 usuarios internos incluidos, 20 GB, establecimiento activo adicional 25 € + IVA y usuario
  interno adicional 15 € + IVA; **Agency**, 499 € + IVA al mes, establecimientos y usuarios
  ilimitados bajo uso razonable, 100 GB. Los usuarios de restaurantes y los establecimientos
  archivados no cuentan ni se cobran en ningún plan. "+ IVA" se aplica al 21 % (el general español, el
  mismo que `RESTAVOR_TAX_RATE_PERCENT`), y se guarda congelado en cada cobro como manda RN-FIN-08.
  Lo que Cuotly emite es un **cobro con referencia bancaria**, no una factura: la numeración fiscal
  sigue en el bloque legal (§170.1, pendiente 20).
- **RN-SUB-02**: **una suscripción cubre un espacio** (§4.2.1) y el espacio lleva su **modo** en
  `spaces.cuotly_status`, con cuatro valores: `trial` · `active` · `archived_trial_ended` ·
  `archived_nonpayment`. Los dos últimos son **solo lectura**. Es un estado guardado y no derivado,
  como `establishments.status`, porque un disparador tiene que leerlo en cada escritura y lo mueven
  solo las funciones que dejan evento y auditoría (RN-SUB-12); un `UPDATE` suelto lo rechaza un
  disparador, igual que en los establecimientos. Es **nulo** en los espacios anteriores al Hito 17
  —Restavor y los de prueba—: Cuotly no se cobra a sí misma, y ponerles un contrato sería
  inventarlo.
- **RN-SUB-03**: los **límites se comprueban en el servidor**, con un disparador en
  `establishments` y otro en `space_memberships`, no en la pantalla. Cuentan como **establecimiento
  activo** todos los que no están archivados (§4.1 distingue solo "activos" de "archivados"), y como
  **usuario interno** todo miembro activo del espacio, propietario incluido. En Pro el límite es lo
  incluido más los adicionales contratados; en Agency no hay límite ("uso razonable" no tiene umbral:
  pendiente 17, no se mide); durante la prueba, **2 establecimientos activos** (§4.4). Crear el
  sexto establecimiento en Pro sin haber contratado el adicional falla con un error de negocio, no
  con un botón escondido.
- **RN-SUB-04**: los **adicionales de Pro** los contrata el propietario como números enteros. **Subir**
  es inmediato y se cobra la **parte proporcional** del periodo en curso, con la misma cuenta que la
  mejora de plan de RN-COM-18. **Bajar** es inmediato para el límite, **nunca por debajo del uso**, y
  sin devolución: la mensualidad siguiente ya sale con la cifra nueva. Solo en Pro y solo con la
  suscripción activa: en prueba no hay nada que cobrar todavía y el tope de la prueba es otro.
- **RN-SUB-05**: la **prueba dura 7 días** desde el instante de aprobar (RN-PLA-05) y **la primera
  mensualidad se emite al aprobar**, con vencimiento al final de la prueba: así el propietario tiene
  importe, concepto y referencia desde el primer día y decide cuándo pagar. Pagarla **activa** el
  espacio. Si la prueba **termina sin pago**, el espacio queda **archivado en modo lectura** en ese
  momento, sin la gracia de 72 h —§4.4 no la da— y con **30 días** para pagar y reactivarse.
- **RN-SUB-06**: el **cobro es manual** (§4.5; sin Stripe, decisión de CLAUDE.md): **transferencia o
  Bizum**. Cuotly genera importe, concepto y referencia. El propietario **declara** el pago (método,
  fecha e importe, con justificante opcional) y **Bosco, o un Administrador de Cuotly con
  `can_manage_subscriptions`** (§167, "gestionar suscripciones"), lo **confirma**, lo **registra**
  directamente si lo ve en el banco sin declaración, lo **rechaza con motivo** si no llegó, o lo
  **revierte con motivo** si se confirmó por error (RN-FIN-04, "corregir"). El dinero es un **libro
  inmutable de apuntes con signo** —`cuotly_ledger_entries`— y el estado del cobro (`pending` ·
  `declared` · `paid` · `overdue`) **se deriva** de ese libro y del vencimiento (RN-DAT-05); no
  existe ningún contador que se actualice.
- **RN-SUB-07**: los **cinco avisos** de §4.5 van a los **propietarios** del espacio, una sola vez
  cada uno por cobro (CA-17, clave de deduplicación): **3 días antes** del vencimiento, **el día**
  del vencimiento, a las **24 h**, a las **48 h**, y el último **antes de las 72 h**, que aquí se
  manda a las **60 h** para que queden 12 h de margen antes del corte (lectura confirmada, decisión 32). El
  último aviso y el de archivado son **obligatorios** (RN-NOT-03: impago grave y pérdida de acceso);
  los demás se pueden desactivar.
- **RN-SUB-08**: **impago** (§4.6): desde el vencimiento hasta **+72 h naturales** es periodo de
  gracia; a las 72 h el espacio pasa a **`archived_nonpayment`**, solo lectura. Un pago **declarado y
  pendiente de confirmar** detiene el corte hasta que se confirme o se rechace: cortar a quien dice
  "ya he pagado, aquí está el justificante" sería bloquear sin comunicación (§4.3). El modo lectura lo
  sostiene **un disparador en toda tabla que lleve `space_id`**, no una lista de pantallas: cualquier
  escritura hecha con identidad de persona en un espacio archivado falla, salvo en las tablas que
  hacen posible lo que §4.6 permite —**pagar** (las de la suscripción de Cuotly), y los avisos, la
  auditoría y los eventos que esas operaciones dejan—. **Exportar** y **contactar con soporte** son
  los Hitos 20 y 21 y llegarán ya exentos. Los procesos del sistema (la cola, sin identidad de
  persona) no quedan congelados: los restaurantes del espacio siguen teniendo sus contratos con él y
  sus relojes no se paran por la deuda de su proveedor con Cuotly (lectura confirmada, decisión 32).
- **RN-SUB-09**: **reactivación**: al confirmarse un pago, si no queda ningún cobro vencido y no han
  pasado los **30 días** desde el archivado, el espacio vuelve a `active` **con sus datos** (§4.6). Un
  espacio archivado **no emite mensualidades nuevas** mientras lo está. Pasado el plazo, el pago se
  registra igual pero la reactivación es una decisión de la plataforma (`platform_reactivate_space`,
  con motivo). La **eliminación operativa a los 30 días NO se implementa**: es el bloque legal
  (pendiente 20) y aquí solo queda escrita la fecha límite.
- **RN-SUB-10**: **cambio de plan** (§4.7). **Pro → Agency** es inmediato y se cobra la **diferencia
  proporcional** al periodo restante; los adicionales de Pro dejan de aplicarse. **Agency → Pro** se
  aplica **en la siguiente renovación**: se programa solo si el uso actual **cabe en Pro** con los
  adicionales que se contraten al programarlo (§4.7: "antes de bajar a Pro se deben resolver
  excesos"), y **desde que se programa rigen los límites de Pro para crecer**, para que en la
  renovación no haya exceso que resolver. Se puede anular mientras no llegue la renovación. Durante
  la prueba no se cambia de plan: §4.4 dice que se elige antes de empezar (lectura confirmada, decisión 32).
- **RN-SUB-11**: el **periodo es un mes** desde el final de la prueba, y cada renovación empieza
  donde acabó la anterior. La mensualidad del periodo siguiente se **emite 7 días antes** de la
  renovación —el aviso de "3 días antes" necesita un cobro al que apuntar— y **vence el día de la
  renovación**. Si hay un cambio a Pro programado, esa mensualidad ya sale con el precio de Pro.
- **RN-SUB-12**: **todo cambio de modo del espacio** deja `state_events` (entidad `space`) y
  `audit_log` con actor, fecha, valor anterior, valor nuevo y motivo; emitir un cobro y declarar,
  confirmar, rechazar o revertir un pago también dejan apunte. Quién en Cuotly confirmó o rechazó
  **no lo ve el propietario** desde la tabla (privilegio de columna, como en RN-PLA-07): lo ve la
  auditoría.
- **RN-SUB-13**: el **almacenamiento** incluido (20 GB Pro, 100 GB Agency; §113) se **mide**
  —`cuotly_space_usage()` suma los bytes de las versiones de archivo del espacio— y se **avisa**,
  desde la decisión 38 (16/09/2026, migración 95): al **80 %** y al **100 %** de lo incluido, al
  propietario del espacio (`storage_threshold_80` y `storage_threshold_100`, con enlace a su
  suscripción), como mucho una vez al mes por umbral mientras siga por encima; y al 100 %, **también a
  Cuotly** (Bosco y quien gestiona suscripciones), porque **lo que pasa de lo incluido se presupuesta
  aparte**: ni precio por GB, ni bloqueo, ni límite duro. Los dos avisos se pueden apagar (no son
  seguridad ni pérdida de acceso). Lo hace el barrido `cuotly_storage_sweep` de la cola, solo para
  espacios con plan de Cuotly. Y "uso razonable" (§4.3) **no tiene umbral**: lo controla Bosco a mano
  desde el panel, que enseña el uso de cada espacio; no se mide ninguna actividad ni se bloquea nada.

Lo que este apartado **no** trae, dicho en claro: **no** trae pantallas —el propietario declara el
pago y ve sus cobros por las funciones y las tablas, y la pantalla llega con el panel del Hito 19—,
**no** trae la exportación ni el contacto con soporte desde el modo lectura (Hitos 20 y 21), **no**
elimina nada a los 30 días (decisión 38: queda tal cual) y **no** mide el uso razonable (sin umbral,
decisión 38). El aviso de almacenamiento (RN-SUB-13) y "una prueba por negocio" (RN-PLA-09) llegaron
después del Hito 22 con la migración 95.

## 32. Panel de Administración de Cuotly, Modo soporte y 2FA — Fase 4 (RN-ADM)

Los dos apartados anteriores dan a la plataforma cosas que decidir —aprobar un espacio, confirmar un
pago— y ninguna pantalla desde la que decidirlas. Este apartado es esa pantalla, y las dos puertas que
la acompañan: **Modo soporte** (§129), la única vía por la que alguien de Cuotly entra en un espacio
ajeno, y **2FA** (§136), sin la cual esa puerta no se entrega. Es el punto más delicado de seguridad
del producto: aquí se abre a propósito lo que el aislamiento multiempresa (§134) cierra en todas las
demás partes, y por eso se abre con el mismo mecanismo que lo cierra —las funciones de pertenencia que
evalúan todas las políticas— y no con una excepción en cada tabla.

Sale de §128 (los doce bloques del panel), §129 (Modo soporte), §136 (2FA), §137 (protección de
cuenta), §167 (quién decide en la plataforma) y §8 (la entrada "Administración de Cuotly" del selector).
Donde la maestra calla, las lecturas quedan escritas como regla y Bosco las confirmó las catorce el
15/09/2026 como **decisión 33** de `docs/DECISIONES.md`; ninguna es un umbral que la maestra sí diera.

- **RN-ADM-01**: **quién es la plataforma**: Bosco (`CUOTLY_OWNER_EMAIL`) y los **Administradores de
  Cuotly** (`platform_roles`). Los dos ven la entrada **Administración de Cuotly** en el selector de
  contexto (§8); Bosco ve el selector siempre, aunque tenga un solo espacio. Un Administrador de Cuotly
  **lee el panel entero** y **actúa solo con el permiso fino** que §167 le haya dado —aprobar
  espacios, gestionar suscripciones, Modo soporte—; leer no está en la tabla de §167 porque es lo que
  hace útil el rol (lectura). Los tres permisos son columnas de `platform_roles`; la tercera,
  `can_support`, llega aquí.
- **RN-ADM-02**: la **2FA es obligatoria** para Bosco y para los Administradores de Cuotly (§136), y
  se hace cumplir en el servidor de una sola forma: **el sombrero de plataforma solo existe en una
  sesión verificada en dos pasos**. `is_platform_owner()` —el único punto de verdad de "¿es Bosco?"—
  exige desde este hito que el token de la sesión lleve el nivel `aal2` de Supabase Auth, y todo lo que
  cuelga de ella (`is_platform_approver()`, `is_platform_subscription_manager()`, las funciones del
  panel, Modo soporte) lo hereda sin tener que acordarse. Sin 2FA verificada, Bosco entra en Cuotly
  como un usuario cualquiera en sus espacios y **ninguna** función de plataforma le responde: la
  pantalla lo manda a registrarla. Quien la tiene registrada —sea quien sea— pasa el segundo paso en
  **cada inicio de sesión**, y hasta pasarlo no ve ninguna pantalla. Para propietarios,
  administradores de espacio, trabajadores y clientes es **opcional** (§136) y se ofrece en la misma
  pantalla de seguridad. Lectura: "obligatoria" se cumple cerrando la plataforma, no cerrando el
  login: Bosco es también propietario de Restavor y dejarlo fuera de su espacio por no haber
  registrado todavía el código sería castigar a Restavor por una regla de Cuotly.
- **RN-ADM-03**: **nombrar Administrador de Cuotly es de Bosco y de nadie más** (§167), y conceder o
  retirar cada uno de los tres permisos también. Se hace por función —`set_platform_admin()`,
  `revoke_platform_admin()`— con apunte de auditoría sin espacio (`platform.*`), como los de la
  solicitud de espacio. La política de escritura directa sobre `platform_roles` que había desde la
  Fase 1 **se retira**: era una segunda puerta sin auditoría. A Bosco no se le nombra ni se le retira:
  lo identifica su correo.
- **RN-ADM-04**: el **panel** tiene los **doce bloques de §128** y cada uno sale de una función que
  comprueba `is_platform_member()`, nunca de una consulta directa a tablas de otros espacios: la
  plataforma no es miembro de ningún espacio y las políticas no la dejan pasar; la función que sí lo
  hace comprueba primero quién pregunta. Lo que enseña cada bloque: **usuarios** (cuentas, espacios a
  los que pertenecen y si tienen 2FA), **espacios** (modo, plan, propietario, uso y deuda),
  **solicitudes de alta** (las de §30, pendientes primero), **suscripciones** (plan y periodo de cada
  espacio), **ingresos** (lo cobrado según el libro: apuntes de pago menos reversiones, por mes; una
  cifra de libro, no una factura —pendiente 20—), **pruebas activas**, **impagos** (cobros vencidos y
  los pagos declarados que esperan confirmación), **almacenamiento** (lo que mide `cuotly_space_usage()`,
  RN-SUB-13: se mide, no se limita), **actividad** (los últimos apuntes de auditoría de todos los
  espacios), **incidencias** (**vacío con su motivo**: son el Hito 21, y no se pinta nada), **soporte**
  (las sesiones de Modo soporte, abiertas y pasadas —lectura: "soporte" en §128 es §129, no las
  incidencias de §131—) y **auditoría** (los apuntes de plataforma: solicitudes, cobros, permisos y
  soporte).
- **RN-ADM-05**: las **dos pantallas del flujo de §30** que el Hito 17 no trajo (decisión 31): el
  **formulario** con el que una persona recién registrada pide su espacio, guarda el borrador, lo envía
  y ve **en qué estado está y el motivo** (RN-PLA-06, RN-PLA-07), y la pantalla desde la que la
  plataforma **revisa, pide información, aprueba o rechaza** (RN-PLA-03). No traen ninguna regla nueva:
  las de §30 ya están en el servidor y aquí solo se pintan los botones que ese servidor va a aceptar.
- **RN-ADM-06**: **Modo soporte es una sesión** (`support_sessions`) sobre un espacio, con **motivo
  obligatorio** escrito por la persona, **nivel de acceso** —`read` · `admin` · `owner`, el mínimo
  necesario (§129)—, **duración** en minutos entre 15 y 240, 60 si no se dice (lectura), y quién,
  cuándo empezó y cuándo acaba. La abre **Bosco siempre, o un Administrador de Cuotly con
  `can_support`** (§167), con 2FA verificada (RN-ADM-02). **No se abre sobre un espacio del que ya se
  es miembro**: ahí no hace falta soporte, hace falta entrar como quien se es. Una persona tiene
  **como mucho una sesión activa por espacio**. Termina **al agotarse el tiempo o al cerrarla** quien
  la abrió (o Bosco); cerrarla deja apunte; agotarse no escribe nada, porque en ese instante no ocurrió
  nada que auditar (lectura).
- **RN-ADM-07**: **cómo abre la puerta**, que es lo que hay que leer dos veces: `is_space_member()` y
  `has_capability()` —las dos funciones que evalúan **todas** las políticas del proyecto— reconocen una
  sesión de soporte activa como si fuera una pertenencia, y con ese reconocimiento entra por RLS en las
  tablas del espacio. Con `read` se ve como un miembro **sin ninguna capacidad**, y un disparador en
  **toda tabla con `space_id`** —el mismo barrido que el modo lectura de RN-SUB-08— rechaza cualquier
  escritura suya, venga por donde venga. Con `admin` se opera como un administrador sin permisos
  concedidos. Con `owner` se opera como el propietario **salvo invitar o añadir personas al equipo**
  (`invite_member`): es lo único que dejaría un acceso vivo después de la sesión, y es exactamente lo
  que Modo soporte no puede dejar. **Nada se escribe en `space_memberships`**: la persona de Cuotly
  nunca figura como miembro. Retirar el permiso, o que se agote el tiempo, cierra la puerta en la
  siguiente consulta sin que nadie tenga que hacer nada.
- **RN-ADM-08**: **el rastro** de §129: abrir y cerrar dejan `support.session_started` y
  `support.session_ended` en la auditoría **del espacio**, familia `support` → `manage_space`: **el
  propietario del espacio ve quién entró, con su nombre**. Aquí P7 no aplica: quien entra no es el
  equipo de mantenimiento del espacio, es Cuotly, y §129 dice "identidad visible en auditoría". Cada
  apunte que esa persona deje mientras dura la sesión lleva estampado `support_session_id` por un
  disparador de `audit_log`, y eso son las **"acciones realizadas"**: la sesión las enseña y el panel
  las cuenta. Además, al abrirse, los **propietarios del espacio reciben el aviso
  `support_session_started`**, **obligatorio** (RN-NOT-03: es seguridad) y con enlace a su auditoría.
- **RN-ADM-09**: un espacio **archivado en modo lectura** (RN-SUB-08) sigue siéndolo **también para
  el soporte**: el disparador de la 90 mira si hay identidad de persona, y la hay. Lo que en ese modo
  se puede hacer —pagar— lo hace su propietario, no Cuotly por él.
- **RN-ADM-10**: la **suscripción, vista por el propietario del espacio**: la pantalla
  `/ajustes/suscripcion` a la que los avisos del Hito 18 ya apuntaban (RN-NOT-04). Enseña el modo del
  espacio, el plan y el periodo, cada cobro con su **estado derivado** (RN-SUB-06), y el formulario para
  **declarar un pago** —método, fecha, importe, referencia— con la función que ya existe. Solo el
  propietario (`manage_space`); ningún administrador del espacio (§4.2.1).
- **RN-ADM-11**: todo lo que la plataforma **hace** desde el panel ya tenía función con permiso desde
  los Hitos 17 y 18 —decidir y aprobar solicitudes, confirmar, registrar, rechazar y revertir pagos,
  reactivar un espacio— y lo nuevo de aquí —nombrar administradores, abrir y cerrar soporte— llega
  igual: por función, con transacción, comprobación de permiso en el servidor y auditoría. El panel no
  añade ninguna vía por PostgREST.
- **RN-ADM-12**: de **§137** quedan hechos, con esto, "sesiones y dispositivos visibles" y "cierre
  remoto" (HU-05), la **verificación adicional** (el segundo paso de la 2FA en cada inicio de sesión) y
  los avisos por **cambios sensibles** en lo que toca a la plataforma (el aviso de soporte). Los
  **límites temporales ante intentos fallidos** los aplica Supabase Auth con su configuración, no este
  código. **No** se implementan los **avisos por dispositivo nuevo**: hace falta decidir qué es "un
  dispositivo" y se dice en la lista de lo que falta, no se finge.
- **RN-ADM-13**: el **incidente de seguridad** de §142 (decisión 38, 16/09/2026, migración 95). Cuotly
  lo declara desde el panel de estado (`declare_security_incident()`, solo con `is_platform_member()`
  y la sesión en dos pasos): es un **evento de estado** de §157 **marcado como de seguridad**
  (`platform_status_events.security`), y **todos los propietarios de los espacios afectados** —todos
  los espacios si no se dice cuáles— reciben el aviso `security_incident`, que es **obligatorio**
  (RN-NOT-03: "seguridad" es su primera palabra) y enlaza a la página pública `/estado`, que marca
  el evento como incidente de seguridad. Queda auditoría con actor, si fue para todos o para algunos
  y cuántos propietarios se avisó. Un evento de estado corriente **no** avisa a nadie. El **texto**
  del aviso lo redacta quien declara; la plantilla la fijará el profesional del bloque legal (paso 4
  del orden acordado). Los otros tres puntos legales de la pendiente 20 quedan **como están**: nada se
  elimina a los 30 días, se conserva todo el historial, los archivos y los datos del restaurante, y
  las facturas las preparará un agente aparte (RN-SUB-05 sigue: referencia bancaria, ninguna factura).

Lo que este apartado **no** trae, dicho en claro: **no** trae las incidencias de §131 ni el horario
humano de §132 (Hito 21: el bloque "incidencias" del panel está vacío con su motivo), **no** trae el
onboarding de §9 ni la propiedad y el fin de un espacio de §127 (Hito 20), **no** trae exportación
(§141, Hito 20), **no** elimina nada a los 30 días ni numera nada fiscalmente (decisión 38: queda tal
cual y las facturas las preparará un agente aparte), **no** avisa de dispositivos nuevos (RN-ADM-12)
y **no** mide el "uso razonable" (sin umbral, decisión 38): el panel enseña el uso de cada espacio
frente a lo incluido en su plan y la decisión de §4.3 es de Bosco a mano.

## 33. Onboarding del espacio nuevo y ciclo de vida del espacio — Fase 4 (RN-CIC)

Los tres apartados anteriores traen el espacio al mundo (§30), le cobran (§31) y le dan a Cuotly un
sitio desde el que mirarlo (§32). Este es el **espacio visto desde dentro y a lo largo del tiempo**:
cómo se rellena recién nacido (§9), cómo cambia de dueño y cómo se termina (§127), y qué puede
llevarse quien se va (§141).

Sale de §9 (onboarding), §127 (propiedad y eliminación), §141 (exportación y cuenta personal), §123
(las secciones de Ajustes, donde esto se usa), §139 (la auditoría registra exportaciones y
eliminaciones) y §140 (propiedad y eliminación piden confirmación adicional).

**Aquí la maestra está más callada que en ningún otro apartado del PRD**: §9 son diez palabras
sueltas y una frase, §127 siete líneas y §141 cuatro. Las tres dicen **qué** con claridad y **cómo**
en ninguna parte. Por eso este apartado lleva más lecturas que los tres anteriores juntos, todas
marcadas como tales; Bosco las confirmó las trece el 15/09/2026 como **decisión 34** de
`docs/DECISIONES.md`, igual que las de los hitos 18 y 19 en las decisiones 32 y 33.
Ninguna inventa un umbral, un precio ni un plazo: los dos únicos números del apartado —los diez pasos
y los 30 días— los dan §9 y §127.

La familia es **`RN-CIC`** y no `RN-ESP` a propósito: `RN-EST` ya es la de establecimientos (§15) y
dos familias a una letra de distancia se confunden en el primer `grep`.

- **RN-CIC-01**: el asistente son **los diez pasos de §9**, en ese orden y sin ninguno más: datos del
  espacio, logotipo, zona horaria, horario operativo, impuestos, planes y servicios, primer
  establecimiento, primer trabajador, notificaciones y seguridad. **No usa IA** (§9, dicho allí con
  todas las letras) y **no bloquea nada**: §9 dice "completa **progresivamente**", así que el espacio
  es utilizable desde el minuto uno y esto es una **lista de tareas pendientes**, no una puerta ni un
  tutorial. Lectura: que no bloquee. La maestra no dice que bloquee, y hacerlo bloqueante dejaría a un
  espacio recién aprobado sin poder ni recibir una solicitud hasta subir un logotipo.
- **RN-CIC-02**: un paso está hecho **porque un dato lo dice o porque el propietario lo confirmó**, y
  la respuesta del servidor **dice cuál de las dos**. Seis se saben por el dato: los **datos del
  espacio** (razón social, identificador fiscal y dirección, no vacíos), el **logotipo** (lo hay), el
  **horario operativo** (hay una versión del calendario contractual), los **planes y servicios** (hay
  al menos uno), el **primer establecimiento** (lo hay) y el **primer trabajador** (hay un trabajador
  activo o una invitación de trabajador en marcha). Los otros cuatro —**zona horaria**, **impuestos**,
  **notificaciones** y **seguridad**— **no se pueden derivar y no se fingen**: los cuatro tienen ya un
  valor de partida (`Europe/Madrid`, 21 %, "todos los avisos activados" por RN-NOT-02, y la 2FA, que
  para el propietario de un espacio es **opcional** por RN-ADM-02), y nada distingue en la base "el
  valor por omisión" de "mirado y decidido". Lo que sí distingue las dos cosas es **una persona
  diciéndolo**, y eso es un hecho con actor y fecha, no un dato de relleno (P6, CLAUDE.md "MUST NOT
  mostrar datos ficticios"). Los seis derivados **también** se pueden confirmar, y por eso el origen
  se guarda y se enseña: un espacio que no quiere logotipo marca el paso y la pantalla dice
  "confirmado por el propietario", no "hecho".
- **RN-CIC-03**: el asistente **lo ve y lo confirma el propietario** (`manage_space`): §9 dice "el
  propietario completa". **No se inventa ningún permiso nuevo para los pasos**: el trabajo de cada
  paso lo hace quien ya podía hacerlo —crear un establecimiento sigue siendo `manage_clients`,
  invitar sigue siendo `invite_member`, publicar un plan sigue siendo lo que era—, y el asistente
  solo mira el resultado. Lectura: que solo el propietario confirme; la maestra no nombra a nadie más.
- **RN-CIC-04**: el asistente **termina** cuando los diez pasos están hechos, y esa fecha se sella
  **una vez**. Que después alguien archive el único establecimiento no devuelve el espacio al
  onboarding: "terminado" es un hecho del pasado y los hechos del pasado no se reescriben (§3.4).
  Lectura.
- **RN-CIC-05**: **transferir la propiedad es del propietario y de nadie más** (§127), y el
  destinatario es **un miembro activo del espacio**, no un correo suelto: dárselo a quien todavía no
  está dentro es invitar, e invitar ya tiene su camino (HU-03). Transferir hace **dos** cosas en una:
  el destinatario pasa a **propietario** y quien transfiere pasa a **administrador de mantenimiento**.
  Lectura, y de las importantes: "transferir" en castellano es que la cosa **cambia de sitio**, no que
  se duplique; si lo que se quiere es un segundo propietario, eso es cambiar el rol de un miembro y se
  hace por donde se cambian los roles. Quien transfiere **no se queda fuera del espacio**: se queda
  como administrador, porque echarse a sí mismo no es lo que pidió. **Modo soporte no transfiere la
  propiedad**, ni siquiera en nivel `owner`: RN-ADM-07 le quita `invite_member` porque es "lo único
  que dejaría un acceso vivo después de la sesión", y transferir la propiedad hace exactamente eso y
  peor —deja al espacio con otro dueño cuando la sesión ya ha caducado—.
- **RN-CIC-06**: **siempre debe existir al menos un propietario** (§127), y eso **lo sostiene un
  disparador sobre `space_memberships`**, no una comprobación dentro de una función. El motivo es
  concreto: `invite_member` es del propietario, y la política de `space_memberships` deja que un
  propietario escriba esa tabla **directamente por PostgREST**, así que una comprobación metida en una
  función la esquiva un `update` de una línea. Un `CHECK` tampoco vale: la condición es sobre el
  **conjunto** de filas del espacio, no sobre una. Ni bajar de rol, ni desactivar, ni borrar al último
  propietario, venga por donde venga.
- **RN-CIC-07**: **archivar es del propietario** (§127) y es el **primer paso de terminar**: §127 dice
  "primero se archiva". Un espacio archivado por su dueño **es un modo más del espacio** (RN-SUB-02),
  `archived_by_owner`, y **no** un estado nuevo en paralelo: hereda tal cual la **solo lectura** que
  RN-SUB-08 ya instaló en toda tabla con `space_id`, y no hay que acordarse de nada. Lo que **no**
  hereda es la reactivación por pago de RN-SUB-09: aquí no hay deuda que saldar, así que pagar no
  resucita nada. Lo restaura su propietario, que es quien lo archivó. Y el **ciclo de impago tampoco
  lo mueve**: un espacio que su dueño ya terminó no se vuelve a archivar por deuda, porque hacerlo
  borraría su plazo de 30 días y cambiaría el motivo por el que está cerrado. **Modo soporte tampoco
  archiva**, por lo mismo que no transfiere (RN-CIC-05): la sesión dura horas y el archivado dura
  treinta días.
- **RN-CIC-08**: **recuperable durante 30 días** (§127). Al archivar se apunta la fecha límite
  —archivado más 30 días—, y **dentro del plazo lo restaura el propietario él solo**, al modo que
  tenía antes. Pasado el plazo, restaurar **es de la plataforma**, exactamente como la reactivación
  tardía de RN-SUB-09: el plazo es el que separa "me he arrepentido" de "esto ya estaba decidido".
- **RN-CIC-09**: **"después se programa eliminación"** (§127) significa eso y **nada más**: se
  **programa**. **Cuotly no borra**, ni al día 31 ni nunca en esta versión. Qué se elimina de verdad,
  qué son los "registros que deban conservarse por obligaciones legales", dónde quedan aislados y con
  qué plazo es del **bloque legal** (§170.1), sigue siendo la **pendiente 20**, y aquí queda el
  placeholder escrito: la fecha se guarda, se enseña y **no dispara ningún borrado**. Coincide además
  con lo que CLAUDE.md exige siempre ("MUST NOT: borrar físicamente registros de negocio").
- **RN-CIC-10**: **el propietario del espacio exporta todo su espacio** (§141). Una exportación se
  **pide**, se **genera en el servidor** y **queda registrada** con quién, cuándo y qué alcance —§139
  nombra las "exportaciones" entre lo que la auditoría registra como mínimo—. **Nunca se arma en el
  cliente**: el cliente no es la autoridad (CLAUDE.md) y armar allí una exportación sería pedirle al
  navegador que decida qué le toca leer. Lectura: el **formato** (un único JSON, que es lo que
  convierte una base entera en un archivo sin inventarle columnas a nadie) y la **entrega** (descarga
  firmada y caducable del mismo bucket privado que los archivos, RN-ARC-08).
- **RN-CIC-11**: **el propietario de un restaurante exporta su grupo o sus establecimientos propios**
  (§141), por la misma puerta y con otro alcance. **Aquí está la trampa del apartado**: una
  exportación es el `select` más grande del producto, y P7 dice que el cliente no ve la identidad
  individual del equipo. La exportación del restaurante **enumera columnas** y **no incluye ninguna de
  las revocadas** —que es además la única forma de que funcione, porque `select *` sobre esas tablas
  devuelve 403 (CLAUDE.md)—. Y esto **no se sostiene con una lista escrita a mano**: se escapó tres
  veces en el Hito 7 y se sostiene igual que allí, con un barrido que recorre lo exportado buscando el
  uuid de alguien del equipo.
- **RN-CIC-12**: **nadie cierra su cuenta si es único propietario** de un espacio o de un grupo
  (§141): "primero transfiere propiedad o cierra entidades". Lo que este apartado entrega es **la
  comprobación y su respuesta útil**: una función dice si la cuenta se puede cerrar y, si no, **qué lo
  impide, cuántos son y qué hay que hacer con cada uno** —transferir este espacio, cerrar este
  grupo—, porque un "no puedes" sin la lista deja a alguien buscando a ciegas. **El cierre de la
  cuenta en sí no se implementa**: cuánto se conserva, de qué se anonimiza y qué se le entrega antes
  es del bloque legal (§170.1, pendiente 20). El placeholder queda dicho, no fingido.
- **RN-CIC-13**: **transferir, archivar, restaurar y exportar dejan apunte en el libro del espacio y
  en la auditoría**, con actor, fecha, valor anterior, valor nuevo y motivo cuando lo haya (CLAUDE.md,
  §139), y **terminar el onboarding** deja el suyo. Los dos que cambian el **modo** del espacio
  —archivar y restaurar— dejan además el **evento de estado** de RN-SUB-12; transferir **no**, porque
  ese libro es el de los modos del espacio y meterle la propiedad serían dos libros dentro de uno. Las
  **diez confirmaciones de pasos no se copian a la auditoría** una por una: viven en su propia tabla, inmutable y con actor y fecha, que es
  exactamente el registro que CLAUDE.md pide, y duplicarlas ahogaría la auditoría del espacio en
  ruido de lista de tareas. Lectura.
- **RN-CIC-14**: transferir la propiedad y archivar son **operaciones críticas**: transacción y
  **clave de idempotencia** (CLAUDE.md), y **confirmación adicional en la pantalla**, que §140 pide
  por su nombre para "propiedad y eliminación". La confirmación de la pantalla es un requisito de
  interfaz **además** del control del servidor, nunca en su lugar.
- **RN-CIC-15**: los dos cambios de este apartado que le quitan algo a alguien **avisan**, y los dos
  son **obligatorios** por RN-NOT-03 (seguridad y pérdida de acceso): **`space_ownership_transferred`**
  a los propietarios y administradores del espacio —quien deja de mandar y quien empieza— y
  **`space_archived_by_owner`** a todo el equipo del espacio, que se encuentra con todo en solo
  lectura y merece saber por qué y hasta cuándo.

Lo que este apartado **no** trae, dicho en claro: **no** borra nada a los 30 días ni cierra ninguna
cuenta (decisión 38: queda tal cual hasta la revisión del bloque legal), **no** valida ni numera los datos fiscales que guarda (§170.1,
como en RN-PLA-01), **no** trae las incidencias de §131 ni el centro de ayuda de §133 (Hito 21),
**no** toca la app móvil (Hito 22) y **no** añade ninguna sección de Ajustes que §123 no nombre.


## 34. Soporte de Cuotly, centro de ayuda y página de estado — Fase 4 (RN-SOP)

Los cuatro apartados anteriores construyen la plataforma y el espacio; este es **el canal entre los
dos cuando algo no va**: las incidencias que un espacio le abre a Cuotly (§131), el reloj humano con
el que Cuotly las atiende (§132), el centro de ayuda que evita muchas de ellas y la página de estado
que dice si el problema es de Cuotly o no (§133, §157). No confundir con el soporte **al
restaurante** de §130 —"Contactar con el equipo de mantenimiento"—, que es la conversación de una
solicitud y ya existe desde el Hito 7, ni con **Modo soporte** de §129, que es Cuotly entrando en un
espacio (§32).

Sale de §131 (soporte de Cuotly), §132 (horario humano), §133 (centro de ayuda y estado), §157 (la
página de estado pública y la alerta crítica), §128 (el bloque "incidencias" del panel, que §32 dejó
vacío con su motivo) y §20.4 (el Inicio del propietario nombra "incidencias"). Donde la maestra
calla, las lecturas quedan escritas como regla, todas marcadas como tales; Bosco las confirmó las
catorce el 15/09/2026 como **decisión 35** de `docs/DECISIONES.md`, igual que las de los hitos 18 a
20 en las decisiones 32, 33 y 34. Ninguna inventa un umbral ni un plazo: §131 dice con todas
las letras que **"no existe inicialmente un tiempo contractual de respuesta público"**, y aquí no se
promete ninguno.

La familia es **`RN-SOP`** (soporte). No `RN-INC`: "incidencia" aquí es la de §131, y la maestra
llama también incidencia a la de seguridad (§142) y a la de la página de estado (§157); una letra
que las mezclara sería el primer `grep` equivocado.

- **RN-SOP-01**: **una incidencia de Cuotly la abre el propietario o un administrador del espacio**
  (§131), y nadie más: trabajadores y clientes **consultan artículos** pero no contactan con Bosco.
  Es una **capacidad nueva**, `contact_cuotly`, propietario y administrador, y **Modo soporte no la
  tiene ni en nivel `owner`** (lectura): abrir una incidencia en nombre de un espacio ajeno es
  hablar con Cuotly haciéndose pasar por el espacio, y RN-ADM-07 ya dice que soporte no deja nada
  vivo en nombre de otro. El espacio ve **todas sus incidencias**, las abriera quien las abriera de
  su equipo (lectura).
- **RN-SOP-02**: **dos tipos y separados** (§133, "sugerencias de funciones separadas de errores"):
  `error` y `suggestion`. Lectura: una sugerencia **es una incidencia de tipo sugerencia**, con los
  mismos seis estados y el mismo hilo, y **sin prioridad ni tiempo de atención**: §131 habla de
  prioridad y de críticas para lo que está roto, no para lo que se pide. Se listan aparte a los dos
  lados.
- **RN-SOP-03**: **los siete campos de §131**: **categoría** (lectura: **los ocho temas de §133**
  —primeros pasos, solicitudes, trabajos, menús, pagos, usuarios, integraciones y seguridad— más
  "otra", para que la incidencia y la guía hablen el mismo idioma), **descripción**, **capturas** y
  **archivos** (adjuntos, RN-SOP-08), **dispositivo** y **versión** (texto libre), e **impacto**
  (lectura: **cuatro niveles**, bajo · medio · alto · **crítico**, porque §131 solo nombra el crítico
  y sin escalón por debajo "impacto" sería una casilla sí/no). Y lo que **"Cuotly puede recoger
  informando al usuario"**: navegador, sistema, pantalla y error no sensible se guardan como
  **contexto técnico** aparte, la pantalla dice **qué se va a enviar antes de enviarlo**, y nunca va
  dentro nada que no sea eso.
- **RN-SOP-04**: **los seis estados de §131** —abierta, en revisión, necesita información, en
  proceso, resuelta, cerrada— y **quién mueve cada transición** (lectura, escrita entera): Cuotly
  lleva una incidencia de abierta a en revisión, a necesita información, a en proceso, a resuelta o
  a cerrada; **necesita información devuelve la pelota al espacio**, que al contestar la deja **en
  revisión**; de **resuelta** el espacio la **cierra** (conforme) o la **reabre** a en revisión
  (lectura: "resuelta" lo dice Cuotly y "cerrada" lo confirma el espacio, o Cuotly pasado un tiempo
  que este apartado **no fija**: sin barrido que cierre solo, porque §131 no da plazo); **cerrada es
  final**. Exigen **motivo** necesita información y cerrar sin resolver (lectura, como RN-PLA-06).
  Una incidencia **no se borra**: se cierra.
- **RN-SOP-05**: **la prioridad se deriva, no se guarda** (RN-DAT-05): **crítica** si el impacto es
  crítico, "independientemente del plan"; si no, **alta** en Agency y **estándar** en Pro (§131).
  Lectura: un espacio **sin plan de Cuotly** —Restavor y el de demostración— es **estándar**. Y como
  §131 dice que no hay tiempo contractual de respuesta, **no se enseña ningún plazo ni promesa**: la
  prioridad ordena la cola de Cuotly y nada más.
- **RN-SOP-06**: **el horario humano de §132 es el tercer reloj** (RN-CLK-08): Europa/Madrid,
  lunes a viernes 14:00–22:00, sábados y domingos 09:00–14:30 y 16:30–21:30, festivos con horario de
  fin de semana. Las incidencias **se envían a cualquier hora** y el **tiempo de atención** —de la
  apertura a la primera respuesta de Cuotly, y a la resolución— **solo cuenta dentro de las
  franjas**. Es la **misma cuenta** que `supportCalendar()` de `src/core/business-clock.ts`, escrita
  también en SQL para que la cifra que ve Cuotly salga del servidor. **No toca el reloj
  contractual** (§132, RN-CLK-08). Lectura: **los festivos de este reloj son los de Cuotly**, no los
  de cada espacio —§132 es el horario de Bosco—, y viven en una lista de plataforma que **nace
  vacía**: hasta que Bosco la rellene no hay festivos, y la página lo dice en vez de suponer un
  calendario.
- **RN-SOP-07**: **atienden Bosco y los Administradores de Cuotly** (lectura: sin permiso fino
  —§167 reparte tres y atender incidencias no es ninguno— y con la 2FA que RN-ADM-02 exige a todo
  lo de plataforma). El espacio ve **"Cuotly"** y no la identidad de quien contestó (lectura, la
  misma de RN-PLA-07: quién revisó es organización interna de la plataforma), y eso se sostiene con
  **privilegio de columna** sobre el autor de los mensajes y el actor de los cambios, con un
  `author_side` que sí se ve para distinguir "lo escribí yo" de "lo escribió Cuotly". Cuotly sí ve
  quién abrió y quién escribió por el espacio.
- **RN-SOP-08**: el **hilo** de una incidencia son **mensajes inmutables** (no se editan ni se
  borran, como los de §26) y **adjuntos** en el **mismo bucket privado** que los archivos, con
  **enlace firmado y caducable** (RN-ARC-08), **25 MB** por archivo y los mismos formatos que
  RN-ARC-06. No van a `files`: esa tabla exige establecimiento y una incidencia es del espacio
  (lectura, la misma que el logotipo en RN-CIC-02). Los bytes se suben **después** de que el
  servidor acepte la fila, nunca antes.
- **RN-SOP-09**: en un **espacio archivado** —por prueba, por impago o por su dueño— **se pueden
  abrir incidencias y escribir en ellas**: RN-SUB-08 dice que en ese modo "se puede pagar, exportar y
  **contactar con soporte**". Las tres tablas quedan **exentas del disparador de modo lectura** con
  ese motivo, y **no** del de Modo soporte (RN-SOP-01).
- **RN-SOP-10**: el **centro de ayuda** (§133) es **buscador y guías por rol**, sobre los **ocho
  temas** de §133. Las guías son **contenido de Cuotly**, en español, **versionado por migración**
  y **sin editor en pantalla** (lectura: escribirlas es de Bosco y cambiarlas deja rastro en el
  repositorio, que es donde se revisan; un editor sin revisión sería la clase de puerta que §140
  pide confirmar). Las **ve cualquiera con sesión** —equipo y restaurante—, cada uno las de **su
  rol** primero. La búsqueda es **de texto completo en español, en el servidor**, y no devuelve
  nada que no sea una guía publicada.
- **RN-SOP-11**: **una búsqueda sin solución se convierte en incidencia conservando el contexto**
  (§133): la incidencia nace con **la consulta que no encontró respuesta** guardada, y quien puede
  abrirla (RN-SOP-01) llega al formulario con ese contexto ya puesto. A quien **no** puede abrirla
  —trabajador, cliente— se le dice **con quién hablar** de su espacio (lectura), no se le esconde
  el botón sin más.
- **RN-SOP-12**: la **página de estado es pública** (§157) y tiene los **cinco componentes de
  §133**: aplicación, autenticación, archivos, notificaciones e integraciones. El estado de cada uno
  sale de **dos fuentes, y la página dice cuál**: lo que Cuotly **declara** (un evento de estado con
  componente, gravedad —degradado, caída, mantenimiento—, inicio y fin) y lo que **se mide**
  cuando se puede medir. Lectura de qué se mide: **notificaciones**, por las entregas de correo
  muertas o atascadas en las últimas 24 h; **integraciones**, por la proporción de conexiones en
  error con fallos consecutivos; **aplicación**, porque la propia página responde. **Autenticación y
  archivos no se miden** desde la base y la página lo dice: "sin medición automática, solo lo que
  Cuotly declare". **No se inventa un "todo operativo"** que no se haya comprobado (CLAUDE.md, P6).
  El **historial** son los eventos declarados ya resueltos. **Ni un nombre ni una cifra de ningún
  espacio** sale por ahí: solo recuentos agregados de la plataforma.
- **RN-SOP-13**: **declarar y resolver un evento de estado es de la plataforma** (RN-SOP-07), con
  apunte de auditoría sin espacio (`platform_status.*`), como los de §32. La **alerta crítica** de
  §157 —"a Bosco y Administradores de Cuotly"— es el aviso `incident_opened` cuando el impacto es
  crítico; la monitorización "automática y permanente" de §157 que dispare sola es del proveedor de
  infraestructura y **no se finge aquí**: queda dicho.
- **RN-SOP-14**: **todo cambio deja rastro**: abrir, cambiar de estado, contestar y adjuntar escriben
  en el **libro de eventos** de la incidencia y en `audit_log` (familia `incident`, **decidida por
  la fila**: quien ve la incidencia ve sus apuntes, sea del espacio o de Cuotly). Abrir es una
  **operación con clave de idempotencia**: pulsar dos veces no abre dos.
- **RN-SOP-15**: **avisos**: `incident_opened` a Bosco y a los Administradores de Cuotly (lectura:
  es su bandeja; crítica o no), `incident_updated` a quien abrió cuando Cuotly la mueve de estado, y
  `incident_replied` al otro lado cuando alguien escribe. **Ninguno es obligatorio** (lectura): no
  son seguridad ni pérdida de acceso (RN-NOT-03). El **bloque "incidencias" del panel** (RN-ADM-04)
  deja de estar vacío y enseña las abiertas por prioridad; el **Inicio del propietario** (§20.4)
  enseña las de su espacio que esperan algo de él.

Lo que este apartado **no** trae, dicho en claro: **no** fija ningún tiempo de respuesta ni lo
enseña (§131), **no** cierra incidencias solas, **no** trae un editor de guías, **no** mide la
autenticación ni los archivos, **no** tiene monitorización automática propia (§157, la del
proveedor no se finge), **no** trae el chat privado cliente–trabajador (§171, fuera de alcance) y
**no** toca la app móvil (Hito 22).

## 35. La app móvil y el push — Fase 4 (RN-MOV)

Los cinco apartados anteriores construyen la plataforma; este pone el producto **en el teléfono**.
Sale de §21 (navegación móvil), §70 (limitación del push), §71 y §72 (preferencias y reglas
operativas, que ya viven en §18), §144 (trabajo sin conexión), §145 (permisos móviles), §176
(experiencia móvil: los once flujos) y §179 (coherencia de lenguaje). La maestra dice **qué** hace
la app y calla en el **cómo** en diez sitios; en los diez se ha elegido lo más defendible, se ha
escrito como regla marcada como lectura; Bosco confirmó nueve el 16/09/2026 y cambió la del texto
del push (**decisión 36** de `docs/DECISIONES.md`). **Ninguna inventa un umbral ni un plazo.**

La familia es **`RN-MOV`** (móvil). No `RN-APP`, que se leería como "aplicación" a secas, ni
`RN-PUSH`, porque el push es una parte de la app y no al revés.

- **RN-MOV-01**: **la app móvil es el mismo producto, no otro.** Reutiliza **tal cual** el dominio
  de `src/core/` y la **misma API** que la web: las funciones del servidor, llamadas con la sesión
  de quien mira, y las políticas de RLS. El teléfono **no es la autoridad de nada** (CLAUDE.md):
  no calcula un consumo, no decide un permiso, no cambia un estado por su cuenta. Lectura: **las
  rutas de la app son las mismas rutas que las de la web** (`/espacios/<slug>/…`), de modo que el
  **enlace profundo** de cada aviso (RN-NOT-04) abre el elemento exacto también en el teléfono,
  cambiando de espacio o de restaurante si hace falta, y **verificando el acceso antes** con las
  mismas políticas: la ruta guardada no autoriza nada por sí misma.
- **RN-MOV-02**: **la navegación es la de §21**: exactamente **cinco destinos y "Más"**, con las
  cuatro barras (propietario y administrador; trabajador; restaurante con Menú Diario; restaurante
  sin él). Lectura: la barra sale de **`mobileNav()` de `src/components/shell/navigation.ts`**, la
  misma función que ya alimenta la barra de móvil de la web, y **no** de una copia: un destino que
  entre o salga de la barra cambia en las dos superficies a la vez (CA-21). "Más" es lo que no cabe,
  derivado, como en la web. El rol sale de la **membresía real** del espacio, no de nada que mande
  el teléfono.
- **RN-MOV-03**: **los once flujos de §176 se completan en el teléfono sin depender del
  escritorio**, cada uno con la **misma función de servidor** que la web: solicitar
  (`create_request_draft` + `submit_request`), aceptar (`accept_request`), asignar (`assign_job`),
  comenzar (`start_job`), bloquear (`block_job` y `unblock_job`), publicar (`publish_job`, con la
  ventana de corrección calculada con el reloj laborable de `src/core/business-clock.ts` y validada
  por el servidor), corregir (`request_free_correction`), pagar o confirmar (`register_payment` por
  el equipo, `upload_payment_receipt` y `accept_quote` por el restaurante), preparar menú
  (`create_menu`, `save_menu_version`, `prepare_menu`, `request_menu_publication`), consultar
  informe (lectura de `reports`) y gestionar equipo y ajustes permitidos (`set_principal_supervisor`,
  `set_notification_preference`). Lo que un rol no puede hacer **no se esconde: se dice** con quién
  hablar, y aunque se llamara a la función igual, el servidor se niega (CLAUDE.md MUST). Lo que la
  app **no trae** se enseña como pantalla que dice **dónde está** (en la web), nunca como pantalla
  vacía ni como dato fingido.
- **RN-MOV-04**: **el push es un canal más de la cola de §18** (RN-NOT-05): `notification_deliveries`
  admite el canal `push` junto al correo, con **una entrega por notificación y canal**, reintentos
  con espera creciente y la misma clave de deduplicación. Lo emite `emit_notification()` cuando el
  destinatario tiene **al menos un dispositivo registrado y vigente**, y lo envía el mismo proceso
  de la cola por un **transporte inyectable** (Expo sobre FCM y APNs; falso en los tests). Un evento
  que §18 marca "visible dentro de Cuotly, sin correo ni push" tampoco va por push. Decisión de
  Bosco (16/09/2026, decisión 36, que cambia la lectura que se le propuso): el push dice **qué ha
  pasado, dónde y qué se pide**: el nombre del evento y el **restaurante** en el título; el
  **espacio**, la **cifra** o el umbral si el aviso los lleva, y **una frase de lo que se pide**
  («Quiero cambiar el precio…», la descripción de la solicitud, el motivo de la ausencia, el
  concepto del cobro) en el cuerpo. Lo resuelve el servidor desde la entidad del aviso en el momento
  del envío (`notification_push_context()`, solo para la cola); **nunca el nombre de nadie del
  equipo**, que no está en ninguna columna que el push lea. El detalle sigue a un toque, detrás de la
  sesión.
- **RN-MOV-05**: **un dispositivo es de una persona** (lectura). Se registra con su token al iniciar
  sesión con el permiso concedido, se **da de baja al cerrar sesión**, y si **otra persona entra en
  el mismo teléfono el token pasa a ella**: el aviso nunca llega a quien ya no está dentro. Un token
  que el proveedor devuelve como **inexistente** (`DeviceNotRegistered`) se da de baja con su
  motivo y **no se reintenta**: no hay nada que reintentar. Registrar y dar de baja dejan **apunte
  de auditoría** sin espacio (`push_device.*`), con actor, valor anterior y nuevo; lo ve el
  interesado y nadie más.
- **RN-MOV-06**: **push respeta las preferencias de §18**: una preferencia más por evento (`push`),
  **activada por defecto** (RN-NOT-02), y los avisos de RN-NOT-03 **no se pueden desactivar
  tampoco por push**; el servidor lo rechaza. §70 entero: la app **pide y recomienda** el push
  explicando antes para qué sirve (lectura: la explicación va **antes** del diálogo del sistema,
  porque ese diálogo solo se puede enseñar una vez); si se rechaza, **aviso persistente** en la app
  con cómo activarlo desde los ajustes del teléfono; **la app funciona sin push**; **el correo es el
  respaldo**, que ya existe; y **el sistema operativo conserva el control final**: Cuotly no puede
  saltárselo y no lo finge.
- **RN-MOV-07**: **permisos de §145, ni uno más**: **cámara** y **selección de fotografías**, y
  **escaneo de documentos**, que es —lectura— **una fotografía del documento con la cámara**, sin
  librería de escaneo ni OCR: la app no reconoce texto. **No ubicación, no micrófono, no contactos,
  no vídeos**: la app **no declara** esos permisos en su manifiesto y el selector **solo admite
  imágenes**. Lectura: cada permiso se pide **en el momento de usarlo** (adjuntar una evidencia, un
  justificante, una foto a una solicitud), nunca al arrancar; y lo que se sube pasa por el **mismo
  registro** que en la web (`register_file()`, `attach_job_evidence()`,
  `attach_file_to_request_draft()`): el teléfono no tiene una puerta propia.
- **RN-MOV-08**: **la biometría es un cerrojo local, después de iniciar sesión** (§145). Lectura: se
  **ofrece** tras entrar, es **opcional**, y si está activada la app pide el desbloqueo al volver a
  primer plano; **no autentica contra el servidor** ni sustituye a la contraseña, y **no es la
  2FA** de RN-ADM-02: el sombrero de plataforma sigue exigiendo la sesión verificada en dos pasos, y
  —lectura— **el panel de Administración de Cuotly y Modo soporte no están en la app**: son de
  escritorio. Si el teléfono no tiene biometría o se rechaza, la app sigue funcionando sin cerrojo.
- **RN-MOV-09**: **sin conexión, §144 tal cual**: se **consulta lo reciente** —lo último que el
  servidor devolvió a esta sesión, guardado en el dispositivo y **marcado con su hora** y el motivo
  "sin conexión"— y se **redactan borradores de solicitudes y mensajes**. Al volver la conexión
  **se pide confirmación antes de enviar cada borrador**. Pagos, aceptaciones, consumos,
  publicaciones y completados **exigen servidor**: sin conexión el botón se deshabilita **con el
  motivo** y —lectura— **no se encola nada**: una aceptación que se ejecutara sola horas después
  contra un estado que ya cambió es exactamente lo que §144 prohíbe. Lectura: la caché es de
  **quien mira** (no contiene nada que el servidor no le haya devuelto a su sesión, así que no
  puede filtrar identidad del equipo al restaurante) y **se borra al cerrar sesión**.
- **RN-MOV-10**: **nunca se duplica una acción** (§144, CA-17), con el añadido de que el teléfono
  puede haber estado horas desconectado. Cada borrador nace con su **clave de idempotencia en el
  momento de crearse, no al pulsar**: enviarlo dos veces, o reintentarlo tras un corte, produce un
  solo mensaje (`post_message`) o una sola solicitud. Lectura: una solicitud se envía en dos pasos
  y el identificador que devuelve el primero (`create_request_draft`) **se guarda en el borrador**
  antes de dar el segundo (`submit_request`), así que un corte entre los dos no crea una segunda
  solicitud al reintentar. Donde la función del servidor no lleva clave —`accept_request`,
  `start_job`, `publish_job`— la protege el **estado**: la segunda llamada falla con su motivo y la
  app lo enseña como "ya hecho", nunca como error de red que invite a insistir.
- **RN-MOV-11**: **el mismo lenguaje** (§179): las entidades y los estados se nombran en la app con
  el **mismo catálogo** que la web (`src/i18n/es.ts`, importado, no copiado), y la app solo añade
  los textos que la web no tiene (push, biometría, sin conexión, permisos). Colores, espaciados y
  tipografía, los de Emerald Control (§146). **Sin modo oscuro** (§147).

Lo que este apartado **no** trae, dicho en claro: **no** trae el panel de Administración de Cuotly
ni Modo soporte (RN-MOV-08), **no** trae la exportación de §141 ni el cierre de cuenta (son de
escritorio, y el bloque legal sigue aplazado), **no** reconoce texto en los documentos
fotografiados (RN-MOV-07), **no** encola acciones críticas para ejecutarlas solas al volver la
conexión (RN-MOV-09), **no** sincroniza calendarios (aplazado en CLAUDE.md) y **no** trae API
pública ni webhooks (aplazados).

## 36. El contexto global: Inicio, Mis solicitudes, Mensajes, Mi cuenta y Ayuda — después del Hito 22 (RN-GLO)

Los treinta y cinco apartados anteriores ocurren **dentro** de un espacio de mantenimiento o de un
panel de restaurante. Este es el primero que ocurre **fuera de los dos**: la zona de la aplicación
que una persona ve por lo que **es** —su cuenta— y no por dónde está. Sale del diseño definitivo
del 16/09/2026 (vistas G01 a G08), que lo dibuja con barra lateral propia: Inicio, Mis solicitudes,
Mensajes, Mi cuenta y Ayuda.

Hasta el 16/09/2026 la raíz de la aplicación era un **selector de contexto** y nada más (HU-02,
§20.1), y además redirigía sola cuando solo tenías un contexto. El diseño la
convierte en un lugar donde se trabaja: lo que necesita tu atención en todos tus contextos a la vez,
tus conversaciones de todas partes, tus solicitudes de alta y tu cuenta.

La familia es **`RN-GLO`** (global). No `RN-HOME`, porque el Inicio es solo una de las cinco
pantallas, ni `RN-USR`, que se confundiría con los usuarios de un espacio (RN-EST-01 y siguientes).

- **RN-GLO-01**: **el contexto global no es un espacio**, y por eso no tiene `space_id` ni membresía:
  es la vista de una persona sobre **todos** sus contextos. Nada de lo que enseña sale de una
  consulta nueva y privilegiada: sale de **las mismas políticas de RLS** que ya deciden qué ve esa
  persona en cada sitio. Si alguien pierde el acceso a un espacio, deja de verlo aquí en la misma
  consulta, sin que haya que acordarse de nada. El equipo de mantenimiento sigue sin ser visible
  para el cliente (CLAUDE.md): las conversaciones compartidas se muestran con "Equipo de
  mantenimiento", igual que dentro del espacio.
- **RN-GLO-02**: **el Inicio dice qué necesita tu atención, en todos tus contextos a la vez** (G01).
  Cada fila lleva **qué es** (un trabajo asignado, una solicitud pendiente de tu revisión, un menú
  por publicar, un pago por confirmar), **de dónde es** (espacio o restaurante) y **qué acción**
  abre, y el filtro deja mirar un solo contexto. Lo calcula el **servidor** en una sola función,
  nunca el navegador sumando pantallas: el cliente no es la autoridad de nada (CLAUDE.md). La lista
  **no inventa urgencia**: el orden es el del vencimiento real, y lo vencido se marca como tal con
  el reloj laborable de `src/core/`, no con el reloj del navegador.
- **RN-GLO-03**: **debajo están tus contextos**: los espacios de mantenimiento donde eres miembro,
  con tu rol, y los paneles de restaurante a los que tienes acceso, con el tuyo. Es el selector de
  HU-02 de siempre, que **no desaparece**: cambia de sitio y gana compañía. Y aquí se entra
  **siempre**, aunque solo tengas un contexto (decisión 42): la raíz es esta pantalla y no una
  redirección. Quien no tenga ninguno
  de los dos ve el motivo y qué puede hacer, nunca una pantalla vacía sin explicación (CLAUDE.md).
- **RN-GLO-04**: **Mis solicitudes son las de creación de espacio** (G04), las de §10 y RN-PLA-01:
  su estado, el plan pedido, la fecha y **la acción que toca ahora** —continuar el borrador, aportar
  la información que Cuotly pidió, ver las instrucciones de pago de una aprobada—. La pantalla dice
  **en su propio texto** que las solicitudes de trabajo están dentro de cada espacio o panel, para
  que nadie las busque aquí. No enseña quién la revisó (RN-PLA-07).
- **RN-GLO-05**: **Mensajes reúne las conversaciones de todas partes** (G07 y G08), en dos pestañas:
  **Mantenimiento** (las de los espacios donde trabajas) y **Restaurantes** (las de los paneles donde
  eres cliente), cada una con su selector y un filtro de no leídas. No hay conversación nueva aquí:
  son **las mismas** de RN-MSG, con las mismas políticas, los mismos diez minutos de edición y la
  misma imposibilidad de borrar. Reúne, no duplica.
- **RN-GLO-06**: **Mi cuenta es de la persona, no del espacio** (G05): perfil (nombre, apellidos,
  correo, teléfono, idioma, zona horaria y foto), seguridad (contraseña, verificación en dos pasos y
  sesiones, que ya existen) y preferencias de notificación. Dos precisiones de lo construido el
  16/09/2026: **la foto** se quedó fuera porque el almacenamiento de archivos de Cuotly es por
  espacio (`files.space_id NOT NULL`) y una foto de perfil no es de ningún espacio —eso lo resuelve
  RN-GLO-09 con un sitio propio—; y **el idioma** sigue sin estar, porque hoy solo hay uno y un
  selector de un solo elemento es un adorno. Las preferencias de aviso de aquí son **de la persona** y valen
  en todos sus contextos, también en el que entre mañana; la preferencia que alguien ponga **dentro**
  de un espacio es más específica y manda sobre esta. La **zona horaria de aquí sirve para
  enseñar fechas**, y **no sustituye a la del espacio**, que es la que manda en todo cálculo de
  plazos y vencimientos (CLAUDE.md MUST, RN-CLK). Los avisos obligatorios de RN-NOT-03 siguen sin
  poder apagarse también desde aquí.
- **RN-GLO-07**: **la Ayuda global es el centro de ayuda de RN-SOP visto desde fuera** (G06):
  buscador, categorías, preguntas frecuentes y contacto con soporte. Los artículos son los mismos
  (`help_articles`), y una consulta abierta desde aquí es una **incidencia** de RN-SOP-03 como
  cualquier otra, con su prioridad y su rastro.
- **RN-GLO-08** *(lectura)*: **la cabecera global lleva buscador, avisos y avatar**, como en el
  resto del producto, y el buscador busca **en lo que la persona ya puede ver**, sin una vía nueva.
  El diseño dibuja el atajo de teclado; el atajo es comodidad, no una regla de negocio.
- **RN-GLO-09 (añadida 19/09/2026, decisión 53)**: **la foto de perfil es de la persona, la cambia
  solo ella, y no la ve quien no la puede ver ya**. Página 7 del diseño definitivo móvil, el botón
  "Cambiar foto".

  - **Dónde vive.** En su propio bucket privado, `avatars`, y **no en `files`**: `files.space_id` es
    `NOT NULL` y una cara no es de ningún espacio —la misma persona puede estar en dos y su cara no
    pertenece a ninguno—. La ruta es `<uuid de la persona>/<archivo>`, y `profiles.avatar_path`
    guarda cuál es la suya. Como el bucket de archivos (RN-ARC-08), es **privado**: no hay URL
    pública de ninguna foto, se firma una cada vez y con caducidad corta.
  - **Quién la cambia.** Solo su dueño, y el servidor no admite otra cosa: `set_my_avatar()` escribe
    la fila de `auth.uid()` y **rechaza una ruta que no empiece por el uuid de quien llama**. Sin esa
    comprobación, mandar la ruta de otro sería ponerle a esa persona la foto que uno quiera.
  - **Quién la ve**, que es la parte delicada. La foto **es identidad**, y CLAUDE.md prohíbe que el
    cliente vea la identidad individual de nadie del equipo de mantenimiento. No hace falta una regla
    nueva: `avatar_path` es una columna de `profiles`, y la política `profiles_select` ya dice
    exactamente lo que hay que decir —tu propia fila, o la de alguien con quien **compartes espacio
    como miembro del espacio**—. Un cliente no está en `space_memberships`, así que **no puede leer
    la fila de nadie del equipo**, foto incluida; y tampoco la de otro cliente de su restaurante, que
    es coherente con el diseño: las listas del panel (páginas 152 y 153) dibujan **iniciales**, no
    fotos. Donde el diseño sí enseña caras es en pantallas del equipo (página 22: carga de trabajo y
    actividad reciente), y ahí las dos personas comparten espacio.
  - **Lo que NO es.** La **foto del restaurante** que el diseño enseña en las listas (página 22) es
    otra cosa: esa sí es del espacio y cabe en `files`. No entra aquí.
  - **El límite de tamaño y los formatos son técnicos, no una regla de producto**: 2 MB y solo
    imágenes (JPEG, PNG, WebP). No es un umbral que Bosco haya fijado y no se presenta como tal.

Lo que este apartado **no** trae, dicho en claro: **no** trae ninguna capacidad nueva sobre los
datos —todo lo que se ve aquí se puede ver ya dentro de su espacio o su panel—, **no** trae el
Agente Cuotly (sigue siendo la entrada con "Próximamente"), **no** cambia ninguna política de RLS y
**no** toca la app móvil, cuya navegación es la de §21 (RN-MOV-02).

## 37. Cómo se entra en Cuotly: la solicitud de acceso y la invitación — después del Hito 22 (RN-ACC)

El diseño definitivo dibuja una puerta que hoy no existe (vistas F01, A01 a A04 y A09 a A12):
**solicitar acceso a Cuotly** antes de tener cuenta. Al escribirla, Bosco decidió algo más grande
(**decisión 41**, 16/09/2026): esa solicitud **ocupa el lugar del registro**. Se acabó el registro
abierto. Quien va a registrarse encuentra el formulario de solicitud, y la cuenta **se crea al
aprobarla**, no antes.

Esto **deroga** dos cosas escritas antes, y hay que decirlo en voz alta para que nadie las
reimplante: el punto 7.2 de la maestra ("inicio de sesión con Google", "inicio de sesión con Apple
en iOS") y la mitad de HU-01 que dejaba registrarse "o con Google". Manda este apartado
(`CLAUDE.md` > `docs/PRD.md` > `docs/ESPECIFICACION-MAESTRA.md`). Lo que sigue vivo de 7.2 —correo
verificado, recuperación por enlace temporal, sesiones consultables y cerrables, segundo factor en
lo sensible— no se toca.

No se confunde con la solicitud de **creación de espacio** de §10 y RN-PLA: aquella la escribe
alguien que **ya** ha entrado, y al aprobarse **crea** un espacio con su prueba de siete días. Esta
es anterior, más corta, y la vista A03 lo dice con todas las letras: **aprobarla no crea espacio ni
panel**. Son, por tanto, **dos puertas seguidas** para quien quiere su propio espacio de
mantenimiento: primero la cuenta, después el espacio. Es a propósito —la cuenta se le da a una
persona y el espacio a un negocio, y no siempre son la misma decisión— y las revisa el mismo permiso
(RN-ACC-06), así que quien aprueba las ve juntas en una pantalla.

La familia es **`RN-ACC`** (acceso).

- **RN-ACC-01**: **dos puertas y ninguna más**. A Cuotly se entra por una **solicitud de acceso que
  Cuotly aprueba** (RN-ACC-02) o por una **invitación de un propietario** (RN-ACC-09), que ya es la
  autorización de alguien que responde por el invitado. **No existe el registro abierto**: no hay
  ninguna pantalla donde alguien se cree una cuenta por su cuenta y quede dentro. El servidor es
  quien lo sostiene, no la pantalla: crear una cuenta es una operación de servidor que exige una
  solicitud aprobada o una invitación viva, y sin ninguna de las dos falla, se llame desde donde se
  llame (`CLAUDE.md`: esconder un botón no es un control de acceso).
- **RN-ACC-02**: **los seis campos** de F01: nombre y apellidos, nombre del restaurante o empresa,
  teléfono, correo electrónico, **DNI, CIF o NIF** y comentarios (opcional). Los cinco primeros son
  obligatorios (el DNI, CIF o NIF lo añadió la decisión 67 del 22/09/2026, con su **país**).
  **El documento se comprueba en el servidor** (decisión 68): el cálculo de control de su país
  (España: DNI, NIE, NIF y CIF; Portugal, Países Bajos y Bélgica) y, para los números de IVA de
  la UE fuera de España, **VIES**. Si el cálculo dice que es falso, **se rechaza**. Lo que no se
  puede confirmar entra **marcado** para que el equipo lo revise antes de aprobar. Ningún
  registro público confirma que un documento de identidad exista: lo que se comprueba es que
  esté bien formado, y en VIES, que la empresa esté dada de alta. Es
  deliberadamente corta: quien la escribe todavía no conoce el producto. La pantalla contesta
  **siempre lo mismo** —"hemos recibido tu solicitud"— haya pasado lo que haya pasado por detrás:
  si ese correo **ya tiene cuenta**, o ya tiene una solicitud abierta, no se abre otra y quien
  recibe el aviso por correo es **la dirección**, no la pantalla. Así nadie averigua quién está en
  Cuotly escribiendo correos en un formulario público, que es lo que RN-ACC-12 exige y lo que la
  pantalla de entrar ya hace con sus mensajes de fallo.
- **RN-ACC-03**: **aprobarla crea la cuenta, y nada más**: ni espacio, ni panel, ni suscripción, ni
  cobro. La cuenta nace con el correo y el nombre de la solicitud, sin pertenecer a ningún espacio,
  y lo primero que ve esa persona al entrar es el contexto global de §36 vacío con su motivo escrito
  (RN-GLO-03). El espacio y su prueba siguen pasando por RN-PLA-05, con todas sus comprobaciones,
  incluida la de una sola prueba gratuita por persona o negocio (RN-PLA-09).
- **RN-ACC-04**: **la contraseña no viaja por correo**. El aviso de aprobación lleva un **enlace de
  un solo uso y con caducidad** donde la persona pone su contraseña la primera vez; usado una vez o
  pasada la caducidad, deja de valer y hay que pedir otro. Ese correo **no lo escribe una pantalla**:
  se encola como el resto del producto, con reintentos e idempotencia, en una cola propia —la de
  RN-NOT-05 cuelga de un espacio y de una notificación, y aquí no hay ni lo uno ni lo otro— y la
  vacía el mismo proceso que ya envía los demás. Bosco propuso enviar la contraseña en el
  propio correo y lo cambió al explicarle por qué no: un correo se queda guardado en el buzón y pasa
  por servidores por el camino, de modo que una contraseña enviada así queda escrita para siempre en
  un sitio que no controlamos. El enlace es igual de sencillo para quien lo recibe.
- **RN-ACC-05**: **cuatro estados y una transición por cada uno**: enviada (en revisión), necesita
  información, aprobada y no aprobada. "Necesita información" lleva **el mensaje del equipo** y la
  **respuesta** de quien solicita, que la devuelve a revisión. "No aprobada" lleva **motivo
  obligatorio**, y el solicitante lo lee. La tabla de transiciones manda en el servidor, como en
  RN-PLA-03: la pantalla no decide nada. Una solicitud no aprobada **no se borra** (`CLAUDE.md`): se
  queda con su motivo y su rastro.
- **RN-ACC-06**: **la revisa Cuotly, con la sesión verificada en dos pasos** (RN-ADM-02), y queda en
  el panel de Administración junto a las solicitudes de espacio. El permiso es el mismo **"Aprobar
  espacios"** de §167 que ya decide sobre las de creación: *"me parece bien lo de aprobar espacios y
  solo lo llevo yo con el correo info@restavor.com"* (decisión 41). Hoy no lo tiene nadie más; el
  permiso existe por si algún día se delega, y ese día se delegan las dos a la vez, que es justo lo
  que se quiere.
- **RN-ACC-07**: **el solicitante no ve quién la revisó** (como RN-PLA-07): ve el estado, el mensaje
  y el motivo, nunca el nombre de quien decidió. Eso sale de la auditoría de plataforma.
- **RN-ACC-08**: **cada cambio de estado deja evento y auditoría** con actor, fecha, valor anterior,
  valor nuevo y motivo cuando lo hay (`CLAUDE.md` MUST), con `space_id` nulo porque todavía no hay
  espacio, igual que en RN-PLA-08. La **creación de la cuenta** al aprobar es uno de esos apuntes, y
  se hace en **una transacción con clave de idempotencia**: aprobar dos veces no crea dos cuentas ni
  manda dos enlaces (`CLAUDE.md` MUST).
- **RN-ACC-09**: **la invitación es la otra puerta, y también crea la cuenta**. *"Si invito,
  directamente le doy acceso a crearse una cuenta, ese enlace que le envío ya es para que se cree una
  cuenta"* (decisión 41). El enlace de invitación de HU-03, que hoy caduca a los siete días, lleva a
  una pantalla con **el correo prefijado y bloqueado**, contraseña y repetición, y nada más. El
  correo no se puede cambiar ahí porque `accept_space_invitation()` exige desde la migración 7 que
  coincida con el de la invitación: dejarlo escribir a mano solo produce un rechazo que quien lo
  recibe no entiende. Creada la cuenta, la invitación se acepta en el mismo paso y la persona entra
  ya dentro de su espacio. Si el correo **ya tiene cuenta**, no hay pantalla de contraseña: la
  invitación se acepta iniciando sesión, que es HU-04 vista desde el otro lado.
- **RN-ACC-10**: **se retira "entrar con Google"**, y con él "entrar con Apple" en iOS: *"vamos a
  quitar lo de entrar con Google directamente, mejor que cada uno rellene correo y contraseña así no
  hay líos"* (decisión 41). Queda **una sola forma de entrar**: correo y contraseña, con la
  verificación en dos pasos donde ya la exige RN-ADM-02. No es solo quitar un botón: un proveedor de
  identidad externo es una tercera puerta que crea cuentas sin pasar por RN-ACC-01, así que se
  retira también del lado del servidor.
- **RN-ACC-11**: **el formulario se comporta** (A09 a A12): los campos mal rellenados se señalan uno
  a uno y el botón dice qué revisar; si el envío falla, **lo escrito no se pierde** y se puede
  reintentar; salir con cambios sin enviar avisa antes; y sin conexión se dice, se deja el texto
  donde está y no se finge un envío. Ninguna de las cuatro inventa nada: son la misma cortesía que
  el resto del producto.
- **RN-ACC-12** *(lectura)*: **una solicitud de acceso se escribe sin cuenta**, así que no hay
  `auth.uid()` con el que atarla. Se escribe desde el formulario público y se lee **solo** desde la
  plataforma; el solicitante hace su seguimiento por el **enlace con clave** que recibe en el correo,
  que es también por donde aporta lo que se le pida en "necesita información". Es el único tramo del
  producto donde alguien hace algo sin sesión, y por eso el formulario público **escribe y no lee**:
  no devuelve nunca si un correo existe, ni cuántas solicitudes hay, ni el estado de ninguna.

- **RN-ACC-13 (añadida 20/09/2026, decisión 59)**: **la tercera puerta es la invitación al panel de
  un restaurante, y la aprueba el espacio.** Hasta hoy las puertas eran dos (RN-ACC-01): una
  solicitud de acceso que aprueba Cuotly, o una invitación al espacio que manda su propietario. Con
  las dos, **un restaurante no podía meter a su encargado**: `grant_establishment_access()` rechaza
  un correo sin cuenta, y eso dejaba a cada empleado de cada restaurante dependiendo de que el
  equipo lo diera de alta a mano. Era lo que RN-PAN-12 dejó escrito como pendiente de decidir.

  Bosco eligió el 20/09/2026, entre las tres opciones que se le pusieron: **"el restaurante invita,
  tú apruebas"**. Y la manda **quien ya puede dar accesos** —el equipo del espacio, o dentro del
  panel quien tenga "Usuarios y accesos" (RN-EST-17)—; no se cambia ningún permiso, solo deja de
  exigirse que el correo tenga cuenta previa.

  **Qué abre exactamente, que es poco a propósito:** la invitación da acceso a **ese restaurante y a
  nada más**. No crea espacio, ni membresía de espacio, ni suscripción (RN-PAN-11), así que la
  superficie nueva es una cuenta que solo puede entrar en un panel. Esa es la razón por la que se
  acepta abrir una tercera puerta y no se aceptó abrirla para "entrar con Google" (RN-ACC-10): allí
  la puerta creaba cuentas sin que nadie respondiera por ellas; aquí responde quien invita, y además
  lo aprueba el espacio.

Lo que este apartado **no** trae, dicho en claro: **no** sustituye a la solicitud de creación de
espacio (RN-PLA), **no** crea espacios, paneles ni suscripciones al aprobarse (RN-ACC-03), **no**
cobra nada, **no** deja ninguna vía de alta que no sean las **tres** de RN-ACC-01 y RN-ACC-13, y
**no** toca el bloque legal, que sigue en el paso 4 del orden acordado.

## 38. Las cuatro del grupo C: transferencia, copias, canales y recordatorios — después del Hito 22 (RN-TRA, RN-BCK, RN-CAN, RN-REC)

Las catorce piezas sueltas del diseño (`docs/diseno/LAS-CATORCE-PIEZAS.md`) se triaron el
17/09/2026 en tres grupos. Once se construyeron ese mismo día porque sus reglas ya existían. Estas
cuatro no las tenían **en ninguna parte**, ni en el PRD ni en la maestra: construirlas antes de
decidirlas habría sido inventarlas, que es lo que `CLAUDE.md` prohíbe. Bosco las decidió en dos
tandas —**decisión 43** el qué, **decisión 44** el cómo—, y esto es lo que decidió, escrito como
reglas antes de tocar código.

La quinta del grupo, los **alérgenos** del editor de menú (R14), sigue sin decidir y **no se
construye**: es la única de las catorce que toca materia legal, y va con el paso 4.

### 38.1 Transferir un restaurante a otro espacio (RN-TRA)

La vista M84 enseña mover un establecimiento a otro espacio de mantenimiento. Es la operación más
delicada de las cuatro, porque mueve la organización interna de un equipo a la casa de otro.

- **RN-TRA-01**: **el historial viaja con el restaurante** (decisión 43). El espacio de destino
  hereda solicitudes, trabajos, tareas, menús, archivos, conversaciones, consumos y auditoría. Se
  decidió con la consecuencia escrita delante: el equipo nuevo pasará a ver trabajos y
  conversaciones internas del equipo anterior. Lo que el principio P7 protege sigue protegido hacia
  el **cliente**; entre equipos, manda esta regla.
- **RN-TRA-02**: **hacen falta dos firmas** (decisión 44). El propietario del espacio de origen la
  **propone** y el propietario del espacio de destino la **acepta**. Un restaurante no cambia de
  espacio porque alguien pulse un botón en el suyo: el destino recibe historial ajeno y tiene que
  decir que sí. Es la misma forma que la solicitud de acceso de §37: se pide, y otro concede.
- **RN-TRA-03**: **mientras la propuesta está abierta, el restaurante sigue entero en el origen**.
  No hay ningún estado intermedio en el que no sea de nadie: se sigue trabajando en él con
  normalidad, y lo único que existe de más es una propuesta pendiente que se ve por los dos lados.
- **RN-TRA-04**: **los cobros abiertos y la permanencia se quedan en el origen** (decisión 44). La
  deuda es de quien la emitió, igual que RN-FIN-14 dice de la baja. El destino empieza a facturar
  desde cero, con el plan y la permanencia que acuerde. Los cobros pagados tampoco viajan: son
  historia contable del espacio que los cobró.
- **RN-TRA-05**: **con deuda vencida no se transfiere** (decisión 44). La propuesta se rechaza en el
  servidor si el restaurante tiene deuda vencida, y el motivo se dice. Sin esta regla, mover un
  restaurante a otro espacio sería una manera de escapar de la deuda cambiando de sitio, y ya existe
  la guarda contraria: de una parada por impago se sale cobrando (RN-FIN-13).
- **RN-TRA-06**: **una propuesta viva por restaurante**. Proponer dos veces el mismo restaurante a
  dos espacios distintos dejaría dos aceptaciones posibles y una carrera por quién pulsa antes.
  Mientras haya una propuesta pendiente no se crea otra; se retira la que hay y se hace la nueva.
- **RN-TRA-07**: **quien propone puede retirarla y el destino puede rechazarla**, en los dos casos
  con motivo. Nada se borra: la propuesta queda con su desenlace, porque "nos ofrecieron un
  restaurante y dijimos que no" es un hecho que se consulta después.
- **RN-TRA-08**: **el acceso del cliente viaja y el del equipo no**. Quien tenía acceso al
  restaurante **como cliente** —su propietario local, sus editores— lo sigue teniendo: es su
  restaurante, no el del equipo. Los accesos del **equipo de origen** (autorizaciones de trabajador
  sobre ese establecimiento) se quedan atrás: son permisos de un espacio y no significan nada en
  otro.
- **RN-TRA-09**: **la transferencia es un acto con nombre y auditoría propia**, en los dos espacios.
  Queda quién la propuso, quién la aceptó, cuándo y con qué motivo. No es un `update` de la columna
  `space_id` y no se puede hacer con uno: si algún día alguien mueve un restaurante escribiendo esa
  columna a mano, lo que se pierde es justamente la explicación.
- **RN-TRA-11** *(lectura, y una contradicción resuelta)*: **el libro de auditoría NO viaja**. La
  decisión 43 dijo "solicitudes, trabajos, cobros, conversaciones y auditoría", y la decisión 44 ya
  sacó los cobros de esa lista. La auditoría sale por una razón distinta y más dura: `CLAUDE.md`
  dice que **los registros de auditoría no se editan ni se borran desde la aplicación**, y cambiarle
  el espacio a una fila de auditoría es cambiar quién puede leerla, que es peor que editarla. La
  jerarquía de autoridad es `CLAUDE.md` > `docs/PRD.md`, así que manda la regla dura. Lo que se lleva
  el restaurante es su **trabajo** —solicitudes, trabajos, tareas, menús, archivos, conversaciones,
  informes, oportunidades—; lo que se queda en cada espacio es **su propio libro**: el de dinero
  (RN-TRA-04) y el de auditoría. El destino empieza su libro con el apunte de la transferencia
  (RN-TRA-09), que dice de dónde vino y con qué motivo.
- **RN-TRA-12** *(lectura)*: **lo que queda en el origen apuntando a lo que se fue no es un error**.
  Un apunte de consumo del origen puede referirse a un trabajo que ahora vive en el destino, y el
  origen verá el apunte sin poder abrir el trabajo. Es la consecuencia correcta de que el trabajo
  viaje y el plan se quede: "este cambio nos consumió una unidad del ciclo, y el restaurante se ha
  ido después". La alternativa —mover también el consumo— sería mover la contabilidad del plan que
  el origen cobró.
- **RN-TRA-13**: **qué tabla viaja y cuál se queda no se decide de memoria**. Las dos listas se
  declaran en la migración y hay un barrido en la suite que recorre **todas** las tablas que tienen
  a la vez `space_id` y `establishment_id` y falla si alguna no está clasificada en una de las dos.
  Una tabla nueva rompe el test hasta que alguien decida de qué lado está, que es lo contrario de
  descubrirlo el día que un restaurante se transfiera.

- **RN-TRA-10**: **un grupo no se parte**. Un restaurante que pertenece a un grupo con más
  restaurantes en el espacio de origen se lleva consigo la pertenencia a un grupo **del destino**,
  que se crea con el mismo nombre si no existía. El grupo de origen se queda con los que no se
  movieron. Partir un grupo entre dos espacios dejaría un "todos los del grupo" que significa cosas
  distintas según quién lo mire.

### 38.2 Copias de seguridad del contenido del restaurante (RN-BCK)

La vista M83 enseña un historial de respaldos, una descarga y una revisión de restauración. No
existía nada: ni tabla, ni proceso, ni una línea escrita.

- **RN-BCK-01**: **se respalda lo que hay dentro de Cuotly** (decisión 43): los datos del
  restaurante, sus solicitudes, sus menús y sus versiones, sus archivos y sus conversaciones. **No
  la web del restaurante**, que Cuotly no aloja: respaldarla habría significado conectarse a donde
  esté alojada, que es otra cosa y no está decidida.
- **RN-BCK-02**: **una copia al día y se guardan treinta** (decisión 44). Un mes de vuelta atrás con
  resolución de un día.
- **RN-BCK-03**: **la copia número treinta y uno desaparece**, y es **el único borrado físico que
  este producto admite**. Se admite porque una copia no es un registro de negocio: es una foto de
  él, y el registro sigue donde estaba. `CLAUDE.md` prohíbe borrar registros de negocio, no fotos
  de ellos.
- **RN-BCK-04**: **restaurar es descargar, y lo aplica el equipo a mano** (decisión 44). Cuotly no
  deshace nada. El motivo es el mismo que sostiene el producto entero: reponer los datos de una
  fecha anterior machacaría apuntes de auditoría, consumos y cobros posteriores, y todo esto está
  construido sobre libros que no se reescriben. Una restauración automática sería la única operación
  de Cuotly capaz de romper esa promesa. **La pantalla lo dice con esas palabras** en vez de ofrecer
  un botón que promete más de lo que hace.
- **RN-BCK-05**: **una copia se descarga con las mismas reglas que un archivo** (RN-ARC-08): enlace
  privado, temporal y firmado después de comprobar el permiso, nunca una dirección pública.
- **RN-BCK-06**: **descargar una copia queda registrado**, con quién y cuándo. Una copia lleva
  dentro todo lo del restaurante, así que quién se la llevó es exactamente el dato que hará falta el
  día que haya que preguntarlo.
- **RN-BCK-07**: **quien puede descargar una copia es el equipo con `manage_clients`**, no el
  restaurante. Una copia es una herramienta de administración y lleva dentro material del espacio;
  el restaurante tiene su propia exportación (§141) para llevarse lo suyo.
- **RN-BCK-09**: **la copia lleva el inventario de los archivos, no los archivos**. De cada archivo
  guarda su nombre, su tamaño, su categoría, cuándo se subió y a qué cuelga; los bytes se siguen
  descargando uno a uno con su enlace firmado (RN-ARC-08). Duplicar los bytes dentro de la copia
  haría dos cosas malas a la vez: doblaría el almacenamiento que el espacio paga (RN-SUB-13) y
  crearía copias de material privado **fuera** de la comprobación de `can_read_file()`. La pantalla
  lo dice así, sin llamar "copia de seguridad completa" a lo que no lo es.
- **RN-BCK-08** *(lectura)*: **una copia que no se ha generado no se anuncia**. Hasta que exista la
  primera, la pantalla dice que todavía no hay copias y por qué, no un historial vacío que parece
  que se llenará solo (CA-20).

### 38.3 Canales de mensajería interna del espacio (RN-CAN)

La vista M76 enseña General, Proyectos web, Menú diario, Redes sociales y los que el equipo cree,
con miembros por canal. El diseño definitivo móvil (página 74) enseña esos cuatro más **Diseño y
creatividad** y **Soporte interno**. Hasta ahora `conversations.type` era un CHECK cerrado de tres valores
—solicitud, interna de trabajo y establecimiento— y quién lee cada una lo decidía
`can_read_conversation()` a partir de la solicitud, el trabajo o el restaurante del que cuelga. Un
canal no cuelga de ninguno de los tres: es una cuarta cosa.

- **RN-CAN-01**: **un canal es del espacio** (decisión 43), no de un restaurante ni de un trabajo.
  Lleva `space_id` y su lista de miembros se elige **a mano**: no hereda de ningún permiso existente.
- **RN-CAN-02**: **el cliente no entra en un canal, nunca**. Es organización interna del equipo, que
  es el principio P7 en su forma más simple: aquí no hay una columna que tapar, hay una fila que el
  cliente no puede ver. Lo sostiene RLS, no la pantalla.
- **RN-CAN-03** *(ampliada el 19/09/2026, decisión 48)*: **los seis nombres del diseño vienen de
  fábrica** —General, Proyectos web, Menú diario, Redes sociales, **Diseño y creatividad** y
  **Soporte interno**— y se crean con el espacio. Eran cuatro desde la decisión 43, que salían de la
  maqueta M76; el diseño definitivo móvil (página 74) enseña los seis, y los dos nuevos son suyos:
  **no se inventó ninguno**.

  No son una lista cerrada: el propietario o un administrador crea los que quiera. Y **sembrar es
  idempotente y no resucita nada**: el espacio que ya tenga un canal con ese nombre no recibe otro,
  y el que lo haya **archivado** (RN-CAN-05) tampoco lo ve volver — un canal archivado sigue
  existiendo, y la comprobación cuenta también los archivados.
- **RN-CAN-04**: **quien crea un canal y gestiona sus miembros es el propietario o un administrador
  del espacio**. Un trabajador escribe en los canales de los que es miembro y no añade a nadie.
- **RN-CAN-05**: **un canal se archiva, no se borra**, como todo lo demás. Un canal archivado deja
  de aparecer en la lista y sigue siendo legible por sus miembros: lo que se dijo dentro se dijo.
- **RN-CAN-06**: **los mensajes de un canal son mensajes** y se comportan como tales: se editan
  durante 10 minutos, no se eliminan nunca (RN-MSG), y su historial de ediciones se conserva.
- **RN-CAN-08**: **ver que un canal existe no es leerlo**. Quien administra el espacio ve la
  **lista** de todos sus canales —nombre, cuántos miembros tiene y si está archivado— aunque no sea
  miembro de ninguno; lo que **se dice dentro** solo lo lee un miembro. Sin esta distinción, los
  cuatro canales de fábrica nacerían invisibles para todo el mundo y nadie podría entrar en ellos:
  el propietario no vería el canal para añadirse. La regla separa dos cosas que parecen una, y la
  que importa —quién lee los mensajes— sigue siendo solo la lista de miembros.
- **RN-CAN-07**: **un canal sin miembros no lo lee nadie**, ni siquiera quien lo creó. No es un caso
  raro que haya que evitar: es la consecuencia correcta de que la lista de miembros sea la única
  llave. Quien crea un canal entra en él en el mismo acto.

### 38.4 Recordatorios de cobro (RN-REC)

La vista M52 enseña tres avisos. El PRD tenía **dos umbrales** —RN-FIN-10 a las +24 h del
vencimiento y RN-FIN-11 a las +72 h— y un tercero inventado habría sido exactamente lo que
`CLAUDE.md` prohíbe.

- **RN-REC-01**: **los tres avisos son el vencimiento, las +24 h y las +72 h** (decisión 43). No se
  añade ningún plazo nuevo: los dos últimos son los que ya existen, y el primero sale de una fecha
  que ya se guarda, `charges.due_at`.
- **RN-REC-02**: **el aviso del vencimiento es lo único nuevo**. Los otros dos ya se emiten al
  pausar y al suspender por impago. El del vencimiento se emite **el día que vence** un cobro que
  sigue con deuda viva, y no pausa nada ni cambia ningún estado: avisa.
- **RN-REC-03**: **cada cobro avisa una sola vez por umbral**, y lo garantiza una clave de
  idempotencia, no un contador. Que el barrido se ejecute dos veces el mismo día no manda dos
  correos.
- **RN-REC-04**: **un cobro sin deuda viva no avisa**, aunque llegue su fecha. Lo que decide es el
  libro de apuntes (RN-FIN-02), no el estado guardado: un cobro pagado ayer no recuerda nada hoy.
- **RN-REC-05**: **el aviso va al restaurante y queda en su historial de avisos**, con las mismas
  preferencias de notificación que todo lo demás (RN-NOT). No es un aviso obligatorio de RN-NOT-03:
  el restaurante puede apagarlo, y las dos consecuencias de no pagar —la pausa y la suspensión— le
  llegan igual porque aquellas sí lo son.

Lo que este apartado **no** trae, dicho en claro: **no** hay restauración automática de una copia
(RN-BCK-04), **no** hay transferencia sin que el destino la acepte (RN-TRA-02), **no** viaja ninguna
deuda entre espacios (RN-TRA-04), **no** entra ningún cliente en un canal (RN-CAN-02) y **no** se
inventa ningún plazo de cobro que no estuviera ya escrito (RN-REC-01).

## 39. Alérgenos en el menú — después del Hito 22 (RN-ALE)

> **Reescrito el 19/09/2026 (decisión 47).** Este apartado decía otra cosa entre el 17 y el 19 de
> septiembre: los alérgenos se declaraban **plato a plato**, con los catorce del Anexo II del
> Reglamento UE 1169/2011 en casillas y una nota libre por plato, distinguiendo un plato *sin
> declarar* de uno *sin alérgenos*. Eso era la decisión 45, y llegó a construirse y migrarse.
>
> El diseño definitivo móvil (`Cuotly_movil.pdf`, página 125) los pone de otra manera: **una sola
> nota de texto libre para todo el menú**, de 200 caracteres, titulada "Alérgenos (según la
> información proporcionada)". Se preguntó con el coste delante y Bosco decidió que manda el
> diseño.
>
> **Lo que se pierde, dicho en claro porque se decidió sabiéndolo**: la distinción entre "sin
> declarar" y "sin alérgenos" —que son lo contrario para quien tiene una alergia—, el dato por
> plato, y la posibilidad de buscar, contar o pintar con icono un alérgeno concreto. Queda escrito
> aquí por si algún día hay que volver.

- **RN-ALE-01**: el menú lleva **una nota de alérgenos**, de texto libre y como máximo 200
  caracteres, referida al menú entero. Ejemplo del diseño: *"Contiene gluten, lácteos y frutos
  secos"*.
- **RN-ALE-02**: **la escribe quien edita el menú** — el restaurante desde su panel y el equipo
  desde la ficha—, con la misma puerta que el resto del contenido (`can_write_menus()`). No hace
  falta permiso nuevo: es una línea más del menú.
- **RN-ALE-03**: **la información es del restaurante y Cuotly no la comprueba.** Ni la valida, ni
  la completa, ni la deduce de los nombres de los platos. Un plato que se llama igual que otro no
  tiene por qué llevar lo mismo.
- **RN-ALE-04**: **no bloquea la publicación.** Un menú sin nota se publica igual. Quien responde
  de esa información es el restaurante, y pararle el menú del día por un campo vacío es un daño
  cierto por un riesgo que Cuotly no está en condiciones de juzgar.
- **RN-ALE-05**: **viaja con la versión** (RN-MEN-03): se guarda dentro de la versión del menú, que
  es inmutable, así que la nota de un menú publicado es la que tenía al publicarse. Copiar un menú
  copia su nota — un menú copiado con sus platos y **sin** su nota sería la manera más silenciosa
  de publicar un menú sin declarar creyendo que la llevaba.
- **RN-ALE-06**: **la comparación de versiones dice si la nota cambió**, igual que dice si cambió
  un plato o el precio.

Lo que este apartado **no** trae, dicho en claro:

- **No cambia la plantilla que se publica** (el PNG y el PDF de §59). Las tres previsualizaciones
  del diseño no imprimen la nota; se declara y se lee en Cuotly.
- **No redacta ningún aviso legal** (paso 4).

---

## 40. El panel del restaurante como contexto propio — después del Hito 22 (RN-PAN)

Lo último que quedaba del paso 2 del orden acordado. El diseño definitivo dibuja el panel del
restaurante (vistas R01 a R44) como **un contexto**, no como una pantalla dentro del espacio de
mantenimiento: con su cabecera "Panel de restaurante", su selector de restaurante y su "Volver al
inicio de Cuotly".

Hasta ahora el restaurante entraba por la misma dirección que el equipo y se le servía su pantalla;
lo que veía alrededor era el armazón del espacio, con el nombre del espacio en la cabecera. Es
correcto en permisos —lo que ve lo decide la RLS— y equivocado en lectura: le dice que está de
visita en casa de otro, cuando el sitio es suyo.

La familia es **`RN-PAN`** (panel). No `RN-GLO`, que es lo que ocurre **fuera** de todo contexto
(§36), ni `RN-EST`, que es el establecimiento como ficha que mira el equipo (§15).

- **RN-PAN-01**: **el panel es un contexto, no una dirección nueva.** Vive donde vivía,
  `/espacios/<espacio>/restaurantes/<id>/…`, y lo que cambia es el armazón. La razón, decidida el
  17/09/2026 (decisión 46): un restaurante es un restaurante, y su enlace debe ser el mismo lo mire
  quien lo mire. La misma dirección sirve a los dos lados y lo que decide qué se enseña es la
  **membresía real del espacio**, nunca un parámetro de la dirección: quien fuerce a mano la vista
  del equipo sigue viendo la suya, y aunque no se ramificara, RLS le devolvería cero filas de todo
  lo interno (CLAUDE.md: ocultar no es controlar).
- **RN-PAN-02**: **el panel no estrena ninguna capacidad.** Es la misma regla que RN-GLO-01 y por el
  mismo motivo: todo lo que enseña sale de las políticas que ya deciden qué ve ese restaurante.
  Cambiar el armazón no puede abrir ni una fila más.
- **RN-PAN-03**: **la cabecera dice "Panel de restaurante" y el nombre del restaurante**, no el del
  espacio de mantenimiento. El espacio es organización interna del equipo y al cliente no le dice
  nada (P7); el nombre que le orienta es el de su local. El nombre de su espacio de mantenimiento
  **no se le enseña en el armazón**, igual que no se le enseña quién del equipo hace su trabajo.
- **RN-PAN-04**: **el selector lista todos los restaurantes de esa persona**, estén en el espacio de
  mantenimiento que estén. Sale de `my_contexts()` (§36, migración 98) y por tanto de la RLS de
  siempre. Cambiar a uno de otro espacio cambia también el espacio de la dirección, que es lo que
  tiene que pasar: la frontera entre espacios de mantenimiento es del equipo, no del cliente, y
  obligarle a salir al Inicio global para cambiar de local sería un rodeo por una frontera que a él
  no le importa.
- **RN-PAN-05**: **con un solo restaurante no hay selector**, se enseña su nombre y ya está. Un
  desplegable de un elemento es una promesa de que hay más.
- **RN-PAN-06**: **"Volver al inicio de Cuotly" está siempre**, y lleva al Inicio global (§36,
  RN-GLO-03). Es la contrapartida de entrar siempre por ahí (decisión 42): si la raíz es el Inicio
  global, desde dentro de cualquier contexto tiene que haber una puerta de vuelta.
- **RN-PAN-07**: **los destinos del panel son los suyos y solo los suyos**: Inicio, Solicitudes,
  Mensajes, Facturación, Informes y datos, Autorizar fuentes y Ayuda, más Menú Diario **solo** si lo
  tiene contratado (§20.3). Ninguna ruta del equipo aparece en su barra: ahí no tiene nada que
  hacer y ofrecérsela sería enseñarle una puerta que no es suya.
- **RN-PAN-08**: **el equipo no ve el armazón del panel.** Quien es miembro del espacio sigue viendo
  la ficha interna de §15.2 con sus cinco pestañas y la barra del espacio, en la misma dirección.
  Son dos lecturas de la misma cosa y cada una tiene su sitio.

### 40.1 Crear el panel del restaurante (añadido 19/09/2026, decisión 48)

El diseño definitivo móvil dibuja el panel como algo que **se crea**: la ficha enseña "Panel del
restaurante · **No creado**" y un botón, y la página 56 es el formulario. Hasta ahora el panel no se
creaba — existía en cuanto alguien del lado cliente tenía acceso al restaurante—, que es lo mismo
dicho de otra manera, pero al equipo no se lo decía nadie.

- **RN-PAN-09**: **"panel creado" se DERIVA, no se guarda.** Un restaurante tiene panel cuando
  alguien del lado cliente tiene acceso vivo (`establishment_memberships` sin revocar). **No hay
  columna** `panel_created_at` ni bandera equivalente, y es deliberado: una bandera guardada puede
  quedarse en `true` con todos los accesos revocados, y entonces la ficha diría "panel creado"
  mientras nadie puede entrar. Tener panel **es** que alguien pueda entrar; lo uno no es un reflejo
  de lo otro, es lo otro. *Cuándo* se creó ya está en `audit_log`
  (`establishment_access.granted`), que es donde viven los "cuándo" (CLAUDE.md).
- **RN-PAN-10**: **crear el panel es dar el primer acceso**, y no se puede crear vacío. El diseño lo
  fija: en su formulario, "Propietario del restaurante" es un campo **obligatorio** y dice
  *"Se enviará una invitación con las instrucciones de acceso"*. Un panel creado sin nadie dentro
  sería un estado que no significa nada para el cliente —no puede entrar igual— y una bandera más
  que mantener.
- **RN-PAN-11**: **crear el panel no crea un espacio, ni una membresía del espacio, ni una
  suscripción.** Lo dice la propia pantalla del diseño, literal: *"El panel pertenece a este
  establecimiento. No crea un espacio de mantenimiento ni contrata automáticamente la suscripción
  de Cuotly del cliente."* Lo único que hace es `grant_establishment_access()` con rol
  **propietario local**.
- **RN-PAN-12**: **a quien recibe el acceso se le avisa** (`establishment_access_granted`, audiencia
  cliente, con enlace a su panel). Antes se le daba acceso en silencio y se enteraba entrando.

  **La persona tiene que tener ya cuenta en Cuotly**, y eso no cambia: `grant_establishment_access()`
  rechaza un correo sin cuenta desde que existe, porque en Cuotly se invita al producto y luego se
  da el restaurante (HU-03). La "invitación" de la pantalla del diseño es **este aviso**, no un alta
  nueva — el campo del diseño es un **desplegable**, no un correo escrito a mano, y esa es la lectura
  que sostiene. Si la intención era dar de alta a alguien que aún no tiene cuenta, esto hay que
  reescribirlo: sería una puerta de creación de cuentas más, y `CLAUDE.md` no deja improvisarla.
- **RN-PAN-13**: **quitar el último acceso deja el restaurante sin panel**, y la ficha vuelve a decir
  "No creado". Es la consecuencia de RN-PAN-09 y se dice aquí porque parece un fallo cuando ocurre:
  no lo es, es la única lectura que no miente.

- **RN-PAN-14 (añadida 20/09/2026, decisión 59)**: **cómo funciona la invitación al panel**, que es
  la tercera puerta de RN-ACC-13.

  **Dos caminos según el correo, y el que decide no es quien invita:**

  - **Si el correo ya tiene cuenta en Cuotly**, no hay invitación: se le da el acceso en el momento,
    exactamente como hasta hoy (`grant_establishment_access()`), y se le avisa (RN-PAN-12). Meter a
    alguien que ya está dentro nunca necesitó permiso de nadie y sigue sin necesitarlo.
  - **Si el correo no tiene cuenta**, se crea una **invitación**, y ahí sí entra la aprobación.

  **Quién aprueba, y el caso que parece una trampa y no lo es:** aprueba **el equipo del espacio**
  (`manage_clients`). Cuando la invitación la manda **el propio equipo**, nace ya aprobada: pedirle
  al espacio que apruebe su propia invitación no es un control, es una pantalla de más. La
  aprobación existe para lo que Bosco quiso controlar —que un restaurante cree cuentas de Cuotly— y
  eso solo pasa cuando invita el restaurante.

  **Los estados** se mueven por tabla de transiciones, como los informes (RN-REP-08) y las
  solicitudes de espacio (RN-PLA-03), no por comparaciones sueltas:

  `pending_review` → `approved` | `rejected` | `cancelled`
  `approved` → `accepted` | `cancelled` | `expired`

  `accepted`, `rejected` y `expired` son **finales**. Quien invitó puede **cancelar** mientras no se
  haya aceptado; el equipo puede **rechazar** con motivo.

  **La caducidad cuenta desde que se aprueba, no desde que se manda**, y son **7 días**, los mismos
  que la invitación al espacio (HU-03). Contarla desde el envío castigaría al invitado por lo que
  tardara el equipo en mirarla: el enlace podría llegarle ya muerto.

  **Aceptarla crea la cuenta y da el acceso en la misma transacción**, con clave de idempotencia
  (`CLAUDE.md` MUST): pulsar dos veces no crea dos cuentas ni dos accesos. El correo va **prefijado
  y bloqueado**, igual que en RN-ACC-09 y por la misma razón — dejarlo escribir solo produce un
  rechazo que quien lo recibe no entiende.

  **Cada movimiento deja evento de estado y apunte de auditoría** con actor, fecha, valor anterior,
  valor nuevo y motivo cuando lo hay (`CLAUDE.md` MUST).

  **Una invitación no es un acceso.** Mientras está pendiente o aprobada, esa persona **no** cuenta
  para RN-PAN-09: un restaurante con una invitación sin aceptar sigue sin panel, porque nadie puede
  entrar todavía. Decir lo contrario sería la bandera guardada que RN-PAN-09 evita.

- **RN-PAN-15 (añadida 20/09/2026, decisión 59)**: **el restaurante no ve quién revisó su
  invitación**. Ve el estado y el motivo del rechazo; nunca el nombre de quien decidió. Es la misma
  regla que RN-ACC-07 para la solicitud de acceso y que RN-PLA-07 para la de espacio, y el mismo
  motivo: al cliente le responde "el equipo de mantenimiento", no una persona (P7).

  Como RLS filtra filas y **no columnas**, esto se sostiene con **privilegios de columna**
  (`CLAUDE.md`): `revoke select on establishment_invitations from anon, authenticated` y luego
  `grant select` de las columnas sin identidad. Consecuencia práctica: `select *` sobre esa tabla
  devuelve 403 y toda consulta enumera columnas.

---

Lo que este apartado **no** trae, dicho en claro:

- **No mueve ninguna dirección.** Los 51 enlaces profundos que construye el servidor y los avisos ya
  guardados siguen valiendo tal cual. Si algún día se decide mudarlo a `/restaurantes/<id>/…`, hará
  falta una migración que los reescriba y una redirección permanente desde la ruta vieja; queda
  escrito en la decisión 46 por si esa lectura vuelve.
- **No cambia las cinco pestañas de la ficha** (§15.2), que son del equipo y llevan hechas desde el
  Hito 7.
- **No toca la app móvil**: su navegación es la de §35 (RN-MOV) y no usa estas rutas.
