# ROADMAP — Cuotly

La Fase 1 se construye por **hitos**. Cada hito termina con `pnpm typecheck && pnpm lint && pnpm test`
en verde, y con una parada para que Bosco lo revise antes de empezar el siguiente.

El orden no es negociable: cada hito se apoya en el anterior. **El hito 2 es la referencia de calidad
de todo el proyecto** — es la rebanada vertical que el resto del código imita.

---

## Estado de los hitos

Actualizado el 31/08/2026.

| Hito | Estado | Nota |
|---|---|---|
| 1 · Cimientos | Cerrado | |
| 2 · Identidad, espacios y permisos | Cerrado | Rebanada vertical de referencia. |
| 3 · Motor de tiempo | Cerrado | |
| 4 · Solicitudes y clasificación | Cerrado | |
| 5 · Consumos y aceptación | Cerrado | Servidor y dominio; sin pantallas. |
| 6 · Trabajos, tareas, asignación y carga | Cerrado | Servidor y dominio; sin pantallas. |
| 7 · Mensajes, archivos y finanzas | Cerrado el 31/08/2026 | Ver salvedades abajo. |
| 8 · Inicio por rol, búsqueda, notificaciones y cierre | Servidor, dominio y armazón | Ver salvedades abajo. |

### Salvedades del Hito 7, dichas en claro

Se cierra a petición de Bosco. Tres cosas que conviene tener presentes y que
no son un fallo, sino alcance:

1. **Entrega servidor y dominio, no pantallas.** Igual que los hitos 5 y 6.
   Las reglas de RN-MSG, RN-ARC, RN-FIN y RN-COR-08 están implementadas y
   verificadas en el servidor (funciones, RLS, libro de apuntes) y en
   `src/core/`, pero el "Panel financiero operativo" que pide este hito y
   las HU-24 a HU-28 redactadas como "quiero ver…" todavía no tienen
   interfaz. Las pantallas de los tres hitos se construyen juntas.

2. **Seis revisiones adversariales; la sexta, sin bloqueantes.** La cuarta
   encontró tres bloqueantes, la quinta uno más y ocho importantes (entre
   ellos que dos comprobaciones de la cuarta eran **vacuas**), y la sexta
   —dirigida a atacar los tests de la quinta, no solo el código— encontró
   cuatro importantes y dos menores, **ninguno de ellos una puerta abierta
   al exterior**. Todo corregido y verificado con mutación. La curva baja,
   pero cada pasada sigue encontrando algo, así que el hito se da por
   cerrado sin fingir que está probado del todo.

   Lo que la sexta cambió de fondo: los tests ya no comprueban solo las
   tablas y funciones que uno se acuerda de mirar. Hay tres barridos en
   falso-cerrado —identidad del equipo, funciones internas abiertas por
   RPC, e invariantes de RLS y `space_id`— que fallan ante cualquier tabla
   o función NUEVA que incumpla la regla, hasta que alguien la clasifique
   con su motivo. Dos fallos que llevaban meses en el árbol
   (`request_versions` sin `space_id`, `space_sequences` con RLS y cero
   políticas) se encontraron precisamente por no tener ese barrido.

3. **La base de datos real va por detrás del repositorio.** El proyecto de
   Supabase está en la migración 24; las migraciones 25 a 33 (el Hito 7
   entero) siguen sin desplegar. Los arreglos de seguridad que tocaban
   objetos del Hito 6 ya vivos se aplican a mano: el primero (migraciones
   27, 29 y 30) el 31/08/2026, verificado; el segundo (migración 32, con la
   función que `anon` podía usar para escribir sin sesión) queda pendiente
   de aplicar.

### Salvedades del Hito 8, dichas en claro

1. **CA-19 no está cumplido del todo, y no puede estarlo todavía.** El
   criterio pide que *cada flujo principal* —solicitar, aceptar, asignar,
   comenzar, bloquear, publicar, corregir, pagar, consultar, gestionar
   equipo— pueda completarse íntegramente en móvil. Esos flujos existen y
   están probados en el servidor, pero sus PANTALLAS no se construyeron:
   los hitos 4 a 7 entregaron servidor y dominio. Lo que este hito entrega
   es el armazón por el que pasarán —menú, barra de móvil de 5 destinos,
   búsqueda, avisos, botón Crear— y lo prueba con la anchura de un
   teléfono. Cada pantalla que llegue añade su recorrido al mismo archivo
   de tests.

2. **CA-22 destapó un problema real de la paleta.** Tres de los cuatro
   colores semánticos del PRD §20.6 no llegan a 4,5:1 contra blanco en
   ninguna de las dos direcciones: `success` 4,29:1, `info` 4,45:1 —a
   0,05 del umbral— y `warning` bastante menos. No se ha cambiado la
   paleta, que es identidad de marca: se ha fijado su USO (iconos, bordes,
   medidores y texto grande, donde AA pide 3:1 y los tres pasan) y queda
   comprobado con un test que falla si alguien los usa para texto normal.
   Si se quiere poder usarlos como texto, hace falta una variante más
   oscura, y esa es una decisión de Bosco.

3. **La cola de envío está montada pero no envía.** `notification_deliveries`
   guarda estado, intentos y espera creciente, y `emit_notification()`
   encola en la misma transacción que la operación de negocio (que es lo
   que hace cierto CA-18). El proceso que llama a Resend y consume la cola
   necesita la clave del proveedor y despliegue, así que queda para cuando
   haya entorno donde ejecutarlo.

   Corrección de la revisión de cierre: esta salvedad decía que solo
   faltaba "el proceso que llama a Resend", y era falso. Faltaba también
   que las operaciones de negocio EMITIERAN avisos — nadie llamaba a
   `emit_notification()` salvo las ausencias.

   Segunda corrección, tras la segunda pasada de la revisión: la anterior
   daba por hecho el §18 entero con la migración 37, y tampoco era cierto.
   Dos de aquellos siete emisores estaban DETRÁS del `return` de su
   función, que en PL/pgSQL no se ejecuta nunca, y de las siete filas del
   §18 solo se cubrían dos y media. Con la migración 38, del §18 emiten
   hoy:

   | Fila del §18 | Estado |
   |---|---|
   | Nueva solicitud sin asignar → propietario y administradores | Emite |
   | Asignación de un trabajo → el responsable | Emite, también al aprobar una reasignación |
   | Inicio → visible dentro de Cuotly para el cliente, sin correo | Emite, y sin encolar correo |
   | Publicación → cliente y supervisión | Emite |
   | Corrección pedida → el responsable | Emite |
   | Consumo de bolsa al 80 % y al 100 % | **No emite** |
   | Umbrales de T2 y T3 | **No emite** |

   Las dos últimas no son un olvido: necesitan un barrido periódico que
   mire los contadores, y ese barrido no existe. Lo que sigue sin existir,
   dicho sin adornos: el barrido de umbrales de consumo y de T2/T3, el
   productor y el consumidor de `scheduled_jobs`, y
   `src/services/queue-runner.ts`. Las cabeceras de las migraciones 35 y
   36 los citaban como si estuvieran hechos.

### Cosas aplazadas que este hito NO inventó

`generate_monthly_charge()` y `evaluate_establishment_dunning()` existen y
funcionan, pero **no se disparan solas**: alguien del equipo tiene que
llamarlas. RN-FIN-01 y RN-FIN-10/11 hablan de que ocurra "automáticamente"
en la fecha de renovación y a las +24 h / +72 h. La cola de trabajos que lo
dispare pertenece al Hito 8; aquí se deja dicho en vez de fingir que ya
pasa.

---

## FASE 1 — Operación real de Restavor

### Hito 1 · Cimientos
- Next.js 15 + TypeScript estricto + Tailwind, App Router.
- Supabase local con migraciones versionadas.
- Sistema visual Emerald Control como tokens (`src/styles/tokens.css`) y componentes base: botón, campo, selector, tabla, tarjeta, badge de estado, modal, toast, estados vacío/carga/error/sin permisos.
- i18n español (`src/i18n/es.ts`). Ningún literal de UI en los componentes.
- Vitest y Playwright configurados con un test de humo que pase.
- `src/core/` creado y vacío de dependencias externas.

**Se verifica con:** `pnpm dev` levanta, `pnpm test` pasa, la página de estilos muestra todos los componentes base.

### Hito 2 · Identidad, espacios y permisos *(rebanada vertical de referencia)*
- Esquema de `users`, `profiles`, `spaces`, `space_memberships`, `groups`, `establishments`, membresías y permisos.
- **RLS en todas las tablas**, con helpers SQL (`current_space_id()`, `has_capability()`).
- Registro, verificación de correo, login con contraseña y con Google, recuperación, gestión de sesiones.
- Selector de contexto y acción "Cambiar de espacio".
- Invitaciones con caducidad de 7 días y flujo de "usuario ya registrado".
- Matriz de capacidades completa en servidor + tabla de auditoría.
- Semilla: el espacio Restavor, sus tres planes, el servicio Menú Diario, Bosco como propietario de plataforma vía `CUOTLY_OWNER_EMAIL`.

**Se verifica con:** CA-01, CA-02, CA-16. Test que intenta leer datos de otro espacio con identidad ajena y falla.

### Hito 3 · Motor de tiempo
- `src/core/business-clock.ts` con los tres calendarios (contractual, Menú Diario, soporte) y calendarios versionados.
- `holidays` y `space_working_hours` con interfaz de configuración.
- `timer_events` y recálculo de contadores desde eventos.

**Se verifica con:** CA-10 y CA-11. Este hito es lógica pura: debe tener la batería de tests más densa del proyecto.

### Hito 4 · Solicitudes y clasificación
- `requests`, `request_versions`, `classifications`, conversaciones de solicitud.
- Flujo completo de estados con sus transiciones válidas.
- Clasificación con la API de Anthropic desde el servidor + fallback por reglas + registro en `ai_usage`.
- Validación humana obligatoria antes de mostrar nada al cliente.
- Copiar y pegar solicitud dentro del grupo.
- T1 en marcha con sus avisos.

**Se verifica con:** HU-10 a HU-15. Test de que la IA caída no bloquea el flujo.

### Hito 5 · Consumos y aceptación
- `consumption_cycles`, `consumption_entries`, `acceptances`.
- Libro inmutable, saldos calculados, créditos compensatorios, devoluciones.
- Aceptación del cliente con transacción, bloqueo de fila e idempotencia.
- Creación del trabajo a partir de la aceptación.

**Se verifica con:** CA-05 a CA-09, CA-17.

### Hito 6 · Trabajos, tareas, asignación y carga
- `jobs`, `tasks`, `assignments`, `supervisions`, `blocks`, `corrections`, `state_events`.
- Asignación automática con candidato único y recomendación determinista con varios.
- Comenzar, bloquear, pausar, publicar, corregir, reasignar.
- T2 y T3 con todos sus avisos. "Fuera de plazo" calculado.
- Puntos de carga y niveles, con el reparto por tareas.
- Columna "Finalizados" con la regla de 30 días.

**Se verifica con:** HU-16 a HU-23, CA-12 a CA-14.

### Hito 7 · Mensajes, archivos y finanzas
- Los tres tipos de conversación, notas internas separadas, edición de 10 minutos, sin eliminación.
- Archivos con versiones, marca interno/compartido, límite de 25 MB, tipos permitidos.
- `charges`, `payments`, confirmación manual, justificantes, ciclo de impago 24 h / 72 h y reactivación.
- Panel financiero operativo.

**Se verifica con:** HU-24 a HU-28, HU-35, RN-FIN-13.

### Hito 8 · Inicio por rol, búsqueda, notificaciones y cierre
- Inicio distinto para propietario, administrador, trabajador y propietario global.
- Búsqueda global con `Ctrl/Cmd + K`, filtrada en servidor.
- Botón Crear contextual.
- Centro de notificaciones + correo con Resend, por cola, con reintentos e idempotencia.
- Calendario operativo básico con eventos automáticos y ausencias.
- Entrada "Agente Cuotly · Próximamente".
- Repaso completo de los criterios CA-19 a CA-22.

**Se verifica con:** revisión adversarial de toda la Fase 1 por un subagente contra este ROADMAP y el PRD.

---

## FASE 2 — Menú Diario
Menús con sus tipos, versiones y estados · tres plantillas · generación de PNG y PDF · solicitud de
publicación y consumo de actualizaciones · flujo manual de publicación en LandingSite con "Marcar como
publicado" · garantía de las 21:00 y recordatorio de las 20:00 · calendario de todos los días del año ·
corrección mínima con la salvedad de las 21:00 · calendario operativo completo · presupuestos adicionales.

## FASE 3 — Datos e informes
Integraciones GA4, Search Console, Business Profile, Clarity y PageSpeed con OAuth y credenciales
cifradas · sincronización programada con estados y sin botón "Sincronizar ahora" · series de métricas ·
oportunidades **por reglas deterministas** con su ciclo de estados · informes de operación, finanzas y
rendimiento digital con flujo de aprobación, versiones, PDF, CSV y envío programado.

## FASE 4 — Plataforma y móvil
App React Native + Expo reutilizando la misma API y el mismo dominio · push con Expo sobre FCM y APNs ·
panel de Administración de Cuotly · solicitudes de creación de espacio y su aprobación · onboarding de
espacio nuevo · suscripciones Pro y Agency con su ciclo de pago manual, impago y archivado · prueba
gratuita de 7 días · Modo soporte · centro de ayuda y página de estado · exportación y conservación.

---

## Antes de lanzar
El bloque legal y fiscal (§170.1 de la especificación maestra) **debe revisarlo un profesional
cualificado**. No se lanza sin eso.
