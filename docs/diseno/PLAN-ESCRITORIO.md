# Plan del diseño definitivo de escritorio, por partes

Escrito el 20/09/2026 volviendo a abrir `docs/diseno/Cuotly_definitivo_diseno.pdf`
—157 vistas, 16/09/2026, el archivo más reciente que no es el de móvil— después de
que Bosco dijera que lo que hay construido "no funciona ni se ve bien".

Este documento **no** repite lo que ya cuenta `MAPA-DEL-DISENO.md` (qué pide el
diseño y qué de eso no existía). Contesta otra pregunta: **en qué orden se
rehace, y qué hay que arreglar en cada trozo** para que la pantalla sea la de
la maqueta y no una aproximación.

## Lo que se ha comprobado antes de escribir esto

- `pnpm typecheck` pasa, `pnpm lint` y `pnpm test` pasan (1.572 tests en web,
  104 ficheros; 23 en móvil). **La aplicación compila y sus tests están verdes**,
  así que "no funciona" no es un fallo que se vea desde aquí.
- Este entorno **no llega a Supabase**: la política de salida contesta 403 al
  CONNECT del dominio del proyecto (ya está escrito en
  `docs/DESPLIEGUE-SUPABASE.md` y lo repite el comentario de
  `apps/web/e2e/flujos-espacio-demo.spec.ts`). Se puede levantar `next dev` y
  ver las pantallas **sin sesión**; las que llevan datos no.
- Sí se ha mirado con los ojos `/armazon`, que pinta el armazón del espacio sin
  base de datos.

## Las doce partes

El PDF se divide solo: 25 secciones en cuatro familias (G, F/A, M, R). Se
agrupan en doce partes que se pueden terminar y comprobar de una en una.

| # | Parte | Vistas | Nº |
|---|---|---|---|
| 1 | Armazón común y contexto global | G01–G08 | 8 |
| 2 | Acceso a Cuotly y estados | F01, A01–A12 | 13 |
| 3 | Mantenimiento · Inicio y Restaurantes | M01–M07, A13, A16 | 9 |
| 4 | Ficha del restaurante · cinco pestañas | M25–M48, M73–M74, M80–M84 | 31 |
| 5 | Solicitudes, Trabajos y Tareas | M08–M11, M77, M78, A14, A15 | 8 |
| 6 | Menú Diario, Mensajes y Calendario | M12–M15, M75, M76, M79 | 7 |
| 7 | Finanzas | M16, M17, M49–M52 | 6 |
| 8 | Informes | M18, M65–M68 | 5 |
| 9 | Equipo, Planes, Agente y Ajustes | M19–M24, M53–M64, M69–M72 | 22 |
| 10 | Panel del restaurante · armazón, Inicio y Solicitudes | R01–R12, R41, R43 | 14 |
| 11 | Panel · Menú Diario, Mensajes y Calendario | R13–R22, A17, A18 | 12 |
| 12 | Panel · Plan, Pagos, Informes, Archivos, Usuarios y Ajustes | R23–R40, R42, R44, A19, A20 | 22 |

---

## Parte 1 · Armazón común y contexto global (G01–G08)

Es la primera porque **es la que más se ve y la que peor está**, y porque las
once siguientes se pintan dentro de ella.

El diseño enseña **un solo armazón** en las 157 vistas: barra lateral de 240 px
sobre verde oscuro con iconos, y encima una barra superior con miga de pan,
buscador con `⌘K`, campana y avatar. El contexto global (G01 a G08) usa
exactamente ese armazón, con sus cinco destinos: Inicio, Mis solicitudes,
Mensajes, Mi cuenta, Ayuda.

Lo que hay hoy en `src/app/(global)/layout.tsx` es **otro armazón distinto**:
una tarjeta blanca con borde a la izquierda, sin iconos, sin barra superior,
sin buscador, sin campana y sin avatar, dentro de un contenedor centrado de
`max-w-6xl`. Es el trozo que hace que entrar en Cuotly no se parezca al diseño.

A rehacer:

1. ~~Que `(global)` use el mismo armazón que el espacio~~ — **hecho el
   20/09/2026**. Un armazón, no dos: `AppShell` recibe `context="global"` y
   pinta los cinco destinos de G01 con sus iconos, sin caja de contexto (no
   hay espacio del que salir) y sin el botón Crear en la cabecera, que G01 y
   G04 no dibujan ahí. Se puede mirar sin sesión en `/armazon/global`.
   Dos cosas que había que recolocar y no perder por el camino: **cerrar
   sesión**, que solo existía en la barra lateral vieja y ahora está en Mi
   cuenta, y la pantalla **"Más"** de móvil, que en esta zona no existía y
   era un 404 en la barra.
2. ~~**Miga de pan completa**~~ — **hecha el 20/09/2026**. Casa, contexto y
   pantalla, y en móvil en su propia fila: en una sola, a 390 px, se quedaba
   en "Arm…".
3. ~~G02/G03 · crear espacio de mantenimiento~~ — **hecho el 23/09/2026**
   (ver el registro de abajo).
4. ~~G04 · Mis solicitudes~~ — **hecho el 23/09/2026** (ver el registro de
   abajo).
5. ~~G05 · Mi cuenta~~ — **hecho el 23/09/2026** (ver el registro de abajo).
6. ~~G06 · Ayuda~~ — **hecha el 23/09/2026** (ver el registro de abajo).
7. ~~G07/G08 · Mensajes~~ — **hecho el 23/09/2026** (ver el registro de abajo).

## Parte 2 · Acceso a Cuotly y estados (F01, A01–A12)

El servidor existe (migración 97, `access_requests`) y las pantallas de
revisión también (`/administracion/accesos`). Aquí toca **fidelidad**: el
formulario de F01 con su columna "¿Qué ocurre después?" y los ocho estados
(enviada, necesita información, aprobada, no aprobada, y sus variantes).

## Parte 3 · Mantenimiento · Inicio y Restaurantes (M01–M07, A13, A16)

- M01 · Inicio del espacio: **cinco tarjetas de cifra** arriba, gráfico de
  actividad, estado por restaurante con barra de progreso, "Necesita atención",
  próximas tareas, resumen financiero, carga del equipo y actividad reciente.
- M02 · Restaurantes: filtros (Grupo, Estado, Plan) + "Limpiar filtros" y tabla
  con foto, grupo, plan, estado, solicitudes abiertas, supervisor y acciones.
- M03–M07, A13, A16: el resto de estados del listado.

## Parte 4 · Ficha del restaurante (M25–M48, M73–M74, M80–M84)

La parte más grande. La cabecera de la ficha del diseño —foto, nombre, estado,
`Restaurante · Plan Premium+ · 25 pequeñas · 5 medianas · 1 grande · 24 fotos`,
"Ver sitio web ↗" y el menú "…"— y las **cinco pestañas con sus subpestañas**.
Las pestañas ya existen como dato en `components/establishment/tabs.ts`; lo que
hay que revisar es que cada bloque se vea como la maqueta.

## Parte 5 · Solicitudes, Trabajos y Tareas (M08–M11, M77, M78, A14, A15)

Incluye la **vista de tablero** de Trabajos (M09) junto a la de lista.

## Parte 6 · Menú Diario, Mensajes y Calendario (M12–M15, M75, M76, M79)

Incluye los **canales internos** (M76) y el calendario del equipo (M15, M75).

## Parte 7 · Finanzas (M16, M17, M49–M52)

Presupuestos, **pagos parciales con su historial** (M51) y los **tres
recordatorios de cobro** (M52: vencimiento, +24 h, +72 h — decisión 43).

## Parte 8 · Informes (M18, M65–M68)

## Parte 9 · Equipo, Planes, Agente y Ajustes (M19–M24, M53–M64, M69–M72)

Ajustes son **siete pestañas** en el diseño: General · Horarios · Impuestos ·
Integraciones · Suscripción · Seguridad · Auditoría (M23, M24).

**La Ayuda del espacio se queda en el menú lateral** (Bosco, 20/09/2026), aunque
el diseño no la dibuje ni en el lateral (M01, M02, M25, M40) ni entre las siete
pestañas de Ajustes. El PRD §133 (RN-SOP-10) la pide y hoy existe en
`/espacios/<espacio>/ayuda` con sus guías y sus incidencias: el menú tendrá un
destino más que la maqueta, y es a propósito. No se anota como fallo de
fidelidad ni se "arregla" en una revisión posterior.

## Parte 10 · Panel del restaurante · armazón, Inicio y Solicitudes (R01–R12, R41, R43)

El segundo agujero grande, y el que más nota el cliente.

El diseño da al panel **su propia barra lateral con once destinos** —Inicio,
Solicitudes, Menú Diario, Mensajes, Calendario, Plan y servicios, Pagos y
facturas, Informes y datos, Archivos, Usuarios y accesos, Ajustes y ayuda— y su
propia barra superior (`Panel de restaurante › Magariños › Inicio`), con el
selector de restaurante arriba a la izquierda.

Hoy el panel es **una sola página larga** de 881 líneas con todos los bloques
seguidos, y tres de sus destinos son **anclas** (`#solicitudes`,
`#nueva-solicitud`, `#mensajes`) a esa misma página. Está escrito y asumido en
`components/shell/navigation.ts`, que además dice cómo dejarlo bien: "el día que
cada bloque sea su propia pantalla, estas tres constantes se cambian por rutas".
Ese día es esta parte.

## Partes 11 y 12 · el resto del panel

Las diez secciones restantes del panel, una vez que la parte 10 les ha hecho
sitio.

---

## Lo que se ha arreglado hasta ahora

| Cuándo | Qué | Dónde se mira |
|---|---|---|
| 20/09/2026 | La barra inferior de móvil, con iconos y Crear en el centro (§20.3, decisión 47) | `/armazon` a 390 px |
| 20/09/2026 | La cabecera, en dos filas en móvil, con el logotipo | `/armazon` a 390 px |
| 20/09/2026 | El contexto global con el armazón de todos (§36) | `/armazon/global` |
| 22/09/2026 | Las **piezas comunes** del diseño de escritorio, en `components/ui`: `PageHeader` (título, subtítulo y acción a la derecha), `Tabs` (subrayadas), `FilterBar` con `FilterSearch` y `FilterSelect`, `StatCard` (la tarjeta de cifra), `Avatar` y `PersonCell` (iniciales, sin fotos de perfil), `ProgressBar`, `ButtonLink` con la variante `outline`, `EntityCell` y `TableFooter` ("Mostrando X de Y"). La cabecera de tabla ya no va en mayúsculas | `/styleguide` |
| 22/09/2026 | **G01** · Inicio global: cabecera con el botón a la derecha, filas de atención con su etiqueta y su botón, espacios y paneles en tarjetas de dos columnas, y abajo mensajes sin leer y solicitudes con su botón | `(global)/page.tsx` |
| 22/09/2026 | **M01** · Inicio del espacio: cinco cifras en una fila, gráfica y "Estado por restaurante" (con barra) al lado, "Necesita atención" y "Próximas tareas" debajo, y la fila de tres con finanzas, carga del equipo y actividad. La tarjeta suelta de Menú Diario desapareció: su cifra ya está arriba | `espacios/[slug]/page.tsx` |
| 22/09/2026 | **M02, M08, M09, M11** · Restaurantes, Solicitudes, Trabajos y Tareas como tablas con foto o avatar, barra de filtros (grupo/estado/plan; restaurante/estado/categoría; restaurante/responsable/estado; responsable/estado/restaurante), pestañas Lista/Tablero y Todas/Mis tareas/Sin terminar, botón de contorno por fila y pie "Mostrando X de Y". En un teléfono Restaurantes sigue en fichas | las cuatro páginas |
| 22/09/2026 | **M12, M14, M15, M16, M18, M19, M21, M23** · la cabecera común y, donde toca, la tabla, las pestañas y las tarjetas de cifra: Menú Diario en tabla; Mensajes como lista de conversaciones con pestaña de canales; Calendario con botones de mes; Finanzas con cinco `StatCard`; Equipo en dos columnas con avatar y rol como insignia; Planes con insignia de plan; Ajustes con `Tabs` | cada página |

| 22/09/2026 | **Ficha del restaurante, el marco (M25 a M48)** · a ancho completo; la cabecera con la foto, el nombre y su estado al lado, "Plan Premium+ \| 25 cambios pequeños · 5 medianos · 1 grande · 24 fotos" contado desde la bolsa del ciclo, "Ver sitio web ↗" y "Editar restaurante"; las cinco pestañas en casillas pegadas a la cabecera; las subpestañas de Operación, Informes y datos y Gestión con `Tabs`. Operación en tablas (M25, M27, M29); el Resumen en rejilla; Gestión · Datos en dos columnas (M40) | `components/establishment/Sheet.tsx` |
| 22/09/2026 | **Ficha del restaurante, el resto (M26 a M48)** · los detalles de solicitud (M26), trabajo (M28), menú (M32) e informe (M39) con "Volver" arriba, el título con su código en una etiqueta y el estado al lado, y el contenido en tres columnas; la tarea (M30) con sus datos en casillas. En Gestión: Pagos con el historial a ancho completo (M42); Usuarios con la tabla arriba, cara y rol en insignia, y panel y equipo lado a lado (M43); Archivos con las carpetas en fichas y la tabla a lo ancho (M44); Notas internas con el aviso de que el cliente no las ve, lista y formulario lado a lado (M46); Historial con la cara de quien hizo cada cambio (M48). No se añade un "Resumen de cobros" con totales: sumar importes en pantalla va contra la regla de que el dinero lo calcula el servidor | las pantallas de detalle y `Sheet.tsx` |
| 22/09/2026 | **Lo que faltaba de la ficha (M42, M45 y el marco de los detalles)** · Pagos con sus tres pestañas, Cobros, Presupuestos y Facturas (`?pagos=`). Cobros como en M42: "Próximo cobro" con la fecha grande, Base, IVA y Total, "Ver detalle" y "Registrar pago"; al lado "Resumen de cobros" con sus dos casillas de color, pero **sin cifra**: dicen "Sin cifra todavía" porque el servidor aún no calcula esos totales y sumarlos en pantalla va contra CLAUDE.md; debajo el historial de cobros en tabla. Facturas dice que Cuotly todavía no emite facturas (bloque legal pendiente). Integraciones como en M45: cada fuente con su estado arriba a la derecha y los botones "Configurar" y "Comprobar", y a la derecha el panel "Configurar …" con los pasos reales de conexión y el estado actual (`?fuente=`). Los detalles de solicitud (M26), trabajo (M28), tareas (M30), menú (M32) e informe (M39) llevan ahora encima la cabecera de la ficha con sus pestañas (`SheetFrame`), cargada con `loadSheetFrame()`; un informe consolidado va sin marco. El icono ámbar va sobre fondo ámbar con el trazo oscuro, porque `text-warning` no pasa el contraste AA | `Sheet.tsx`, `SheetHeader.tsx`, `IntegrationsBlock.tsx`, `frame-load.ts` y las cinco pantallas de detalle |
| 22/09/2026 | **Acceso a Cuotly (F01, A01 a A12)** · cabecera pública ("Cuotly by Restavor", Ayuda, Mi cuenta y Cerrar sesión con sesión; "Iniciar sesión" sin ella) y miga de pan. F01 en dos columnas con "¿Qué ocurre después?" a la derecha; A09 marca cada campo en rojo con su frase, todos a la vez (`accessRequestFieldProblems()`); A10 avisa arriba, el botón dice "Reintentar envío" y lo escrito se repone (React 19 vacía el formulario al enviar y antes se perdía); A11 abre "Tienes cambios sin enviar" al pulsar un enlace de la página; A12 detecta la falta de red, apaga el botón y ofrece "Comprobar conexión". A01 a A04 en el enlace de seguimiento con su círculo, su caja de estado, el mensaje o el motivo y la respuesta. A05 en las tres pantallas de enlace (alta, invitación, panel); A06 en el espacio cuando quien mira no tiene nada en él; A07 es el `not-found` de toda la aplicación; A08 lo manda `proxy.ts` cuando el navegador trae una sesión que el servidor rechaza (`core/session-expiry.ts`). Entrar y poner contraseña siguen en la tarjeta sobre verde (`AuthCard`), que no tiene diseño en el PDF. No se copia: "Datos de ejemplo" (se enseña lo que la persona escribió o lo que devuelve el seguimiento, que es nombre y negocio y no el teléfono ni el correo), "Ver solicitud" en A01 (el enlace con clave solo viaja por correo, RN-ACC-12), "Contactar con Cuotly" (no hay dirección de contacto decidida), y Ayuda y Mi cuenta sin sesión (no llevarían a ningún sitio) | `components/access/`, `(auth)/`, `proxy.ts`, `not-found.tsx` |
| 22/09/2026 | **Decisión 67 en F01, A01, A03 y A04** · el formulario pide también **DNI / CIF / NIF**, obligatorio, debajo del teléfono y el correo, con su frase de A09 y en "Datos de tu solicitud" de A01 (migración 125). "Contactar con Cuotly" escribe a info@restavor.com: enlace subrayado en A03, botón lleno en A04. "Ayuda" sin sesión escribe a esa misma dirección, en la cabecera y en A05. La revisión de `/administracion/accesos` enseña el documento | `AccessRequestForm.tsx`, `FollowUpView.tsx`, `core/contact.ts` |
| 22/09/2026 | **Decisión 68 en F01** · "País del documento" (desplegable, España por defecto) al lado de "DNI / CIF / NIF". Un documento cuyo cálculo de control no cuadra se marca con "Este documento no es válido para ese país" y no se envía; las empresas de la UE se consultan en VIES. En `/administracion/accesos`, el país, "Comprobado" o "Revisar" con su motivo y el nombre registrado en VIES | `core/tax-id.ts`, `services/vies.ts`, `services/access-request.ts` |
| 22/09/2026 | **Panel del restaurante · Inicio (R01, R02, R04, R43)** · "Hola, {nombre}" con "Nueva solicitud" y, con Menú Diario, "Crear menú"; la foto, el nombre, el código y la ciudad del local. Arriba, las tarjetas de lo que espera algo del restaurante (solicitud por aceptar o contestar, menú de camino a publicarse, cobro próximo o vencido; sin pagos visibles, los mensajes del equipo) o "Todo al día". Debajo, Tu plan con las cuotas del ciclo en barras, Próxima publicación, Actividad reciente, Mensajes y Trabajos en curso, cada una con su vacío dicho. R04: "Primeros pasos" mientras no haya ninguna solicitud. R43: el aviso de estado arriba del todo. No se copia el precio del plan (el restaurante no lee `plans`) ni la frase de presentación del local (no existe ese dato). El resto del panel sigue debajo hasta las partes 11 y 12 | `components/panel/PanelHome.tsx`, `restaurantes/[id]/panel-home-load.ts` |
| 22/09/2026 | **Panel del restaurante · Solicitudes (R05 a R12)** · "Solicitudes" y "Nueva solicitud" dejan de ser anclas y son pantallas (`PANEL_ROUTES`). R05: tabla con Estado, Fecha (30, 90 días o un año) y Tipo en la barra de filtros —las opciones salen de lo que el restaurante tiene—, "Ver solicitud" por fila y paginación de diez. R06: dos columnas, el restaurante con su foto, el tipo fijo en "A valorar por mantenimiento", descripción con contador, dónde, prioridad y motivo (RN-REQ-05), un adjunto y la nota "Importante"; "Guardar borrador" lleva al listado y "Revisar solicitud" a R07. R07: resumen con "Editar contenido" (que ahora incluye la prioridad: un borrador sacado de una conversación no la traía y no se podía enviar), adjuntos, "El equipo revisará tu solicitud", copiar a otro restaurante del grupo y "Cancelar" / "Confirmar envío". R08 a R12 en una sola ficha que cambia con el estado: resumen, camino con fechas reales (migración 127, `client_request_milestones()`), clasificación propuesta con el consumo del ciclo antes y después de aceptar (R09), presupuesto (R10), seguimiento horizontal, último mensaje del equipo y "Ver cambio publicado" a la web del restaurante (R11), corrección y cancelación con su motivo (R12). No se copia: la foto por solicitud, "Asunto" y "Fecha límite deseada" (no existen en la solicitud), la lista "Qué incluye" (se enseña lo que escribió el equipo al clasificar), el "Antes / Después" (nadie guarda la imagen anterior) ni "Datos de ejemplo". En la app, las dos rutas nuevas siguen llevando al panel | `restaurantes/[id]/solicitudes/`, `components/panel/RequestPieces.tsx`, `core/client-requests.ts` |
| 22/09/2026 | **Panel del restaurante · Menú Diario (R13 a R19, A17, A18)** · R13: la cabecera con "Actualizaciones del ciclo" (X / 30 utilizadas, del libro con `menu_update_balance()`) y el ciclo actual, las secciones Menús · Plantillas · Servicio y consumo, filtros de mes, estado y plantilla (con las opciones que el restaurante tiene), "Crear menú" y "Copiar menú anterior" (a `/menu-diario/nuevo`), la tabla con fecha, título, plantilla, estado, última versión guardada y "Ver", y abajo "Sobre las actualizaciones" y "¿Necesitas ayuda?". La ficha del menú en cuatro pestañas (`?vista=`): Editor (R14: primeros, segundos y postres en tres columnas, precio y bebida, alérgenos, datos del menú y la vista previa al lado), Vista previa (R16: el menú grande, descargar PDF o imagen con "no lo publica", información y estado), Publicación (R17: datos, plazos de RN-MEN-07, "Recibida · En preparación · Publicada" sobre los once estados, las acciones y el historial) y Versiones (R18: lista con "Publicada" y "Después de las 21:00", comparar, descargar, copiar como nuevo borrador y corrección). La vista previa es el mismo dibujo que el PNG (`MenuImage`) reducido, y no registra descarga. A17: "Hay una versión más reciente" con las dos versiones, lo que cambió y "Comparar versiones". A18: "Los últimos cambios todavía no están publicados" (con "Solicitar publicación de vN") o "Has guardado cambios después de pedir la publicación". R15: las plantillas con su vista previa pintada con los platos del último menú guardado, no con platos de ejemplo, y "Solicitar nueva plantilla" como solicitud. R19: el servicio activo, el consumo del ciclo con su periodo y el aviso de agotado, y las plantillas. No se copia: el guardado automático, "Texto plano", fecha, hora y nota al pedir la publicación, el autor de cada versión (P7), "Cambiar logo", el precio del servicio (el restaurante no lee `services`), "Compromiso de 3 meses" (es del mantenimiento) ni "Solicitar actualización adicional" y "Presupuesto previo" (no existe esa operación) | `restaurantes/[id]/menu-diario/`, `components/menu/MenuPreview.tsx`, `core/client-menus.ts` |
| 22/09/2026 | **Panel del restaurante · Mensajes y Calendario (R20 a R22)** · "Mensajes" deja de ser un ancla y es su pantalla (`PANEL_ROUTES.messages`; ya no queda ninguna ancla en el panel). R20: a la izquierda la conversación general y la de cada solicitud, con lo último escrito y los sin leer (los cuenta el servidor); en el centro la elegida con su estado y "Ver solicitud"; a la derecha la información de la solicitud o, en la general, "Convertir en solicitud". Las conversaciones salen de `list_conversations()`, que filtra con `can_read_conversation()`: una interna de trabajo no llega nunca. "Calendario" entra en el menú del restaurante. R21: filtros Todos · Menús · Solicitudes · Renovaciones · Informes · Pagos, la rejilla del mes de lunes a domingo con hoy marcado, el mes siguiente pequeño, "Evento próximo" y la leyenda. R22: la agenda por meses y, al lado, el detalle del evento con su botón. Los eventos se derivan en el servidor de lo que el restaurante puede leer (menús, solicitudes, la renovación de su bolsa y la de Menú Diario, informes enviados y, si ve los pagos, cobros que vencen); `space_calendar()` no sirve aquí porque lee `spaces` y `menu_publications`. En la app, Mensajes sigue llevando al panel y Calendario dice que está en la web. No se copia: "Nuevo mensaje" (la general existe siempre), la vista "Semana" ni la foto del evento | `restaurantes/[id]/mensajes/`, `restaurantes/[id]/calendario/`, `core/client-calendar.ts` |
| 22/09/2026 | **Panel del restaurante · Plan y servicios, Pagos y facturas (R23 a R27)** · "Plan y servicios" entra en el menú del restaurante y "Finanzas" pasa a llamarse "Pagos y facturas". R23 (`/plan`): el plan activo con su nombre (de sus condiciones), lo que incluye cada ciclo y lo gastado en barras (de la bolsa del ciclo), la renovación, la permanencia y un cambio programado si los hay (solo para quien ve los pagos), Menú Diario como servicio adicional, el libro de consumos (que antes estaba en facturación) y las condiciones con su botón de aceptar (`TermsCard`, la misma tarjeta que el Inicio). R24 (`/plan/cambio`): la baja con su formulario de siempre (RN-EST-09) y el cambio de plan como petición escrita en la conversación general, porque el cambio lo programa el equipo y no hay operación del restaurante. R25: tres tarjetas —pendiente, próximo vencimiento, último pago— **sin sumar dinero** (cuenta los cobros y enseña un importe solo si es uno, el del servidor), pestañas Todos · Pendientes · En revisión · Pagados, periodo, y la tabla con base, IVA, total, estado, "Ver detalle" y "Subir justificante". "En revisión" es un cobro con justificante subido y aún sin pagar (RN-FIN-06). R26: base, IVA, total, pendiente, vencimiento, cómo pagar, subir justificante, los enviados y los pagos apuntados. R27: facturas y presupuestos. No se copia: el precio y la frase del plan (el restaurante no lee `plans`), un "plan propuesto" con precio y contenido (tampoco puede leerlos), la cuenta, el Bizum y la "Referencia de pago" (no se guardan) y las facturas (numeración fiscal pendiente, bloque legal: la pestaña lo dice) | `restaurantes/[id]/plan/`, `restaurantes/[id]/facturacion/`, `core/client-billing.ts`, `components/panel/TermsCard.tsx` |
| 22/09/2026 | **Panel del restaurante · Informes y datos (R29 a R35, A19, A20)** · Las seis secciones ya existían con las mismas piezas que la ficha del equipo (`DigitalSections`), incluidos los estados "Sin conectar" (A19) y "Esperando primeros datos" (A20); lo que cambia es la presentación. Cabecera con el formato del panel y la primera pestaña se llama "Informes" (R29): a la izquierda los informes enviados en tarjetas con "Ver informe" y "Descargar" y la nota de que solo salen los que el plan incluye y el equipo ha enviado; a la derecha el último con "Ver informe completo" y "Tus solicitudes este mes" (enviadas y publicadas o cerradas, contadas de verdad). Analítica, Búsqueda, Comportamiento, Rendimiento y Oportunidades (R30 a R34) siguen siendo las secciones de siempre, con sus datos de las fuentes conectadas. No se copia: la "Tasa de resolución" (una cifra derivada que nadie define), el resumen redactado y las recomendaciones del informe en la portada (están dentro del informe), el mapa de calor (Cuotly no guarda ninguno: la sección enseña las métricas que llegan de Clarity) ni ninguna cifra de ejemplo | `restaurantes/[id]/datos/page.tsx`, `components/report/ClientReports.tsx` |
| 22/09/2026 | **Panel del restaurante · Archivos, Usuarios y accesos, Ajustes y ayuda (R28, R42, R36 a R40, R44)** · El menú del restaurante termina como el dibujo: Archivos, Usuarios y accesos y "Ajustes y ayuda" (que lleva a `/ajustes`; Autorizar fuentes pasa a ser una pestaña de ahí). R28 y R42 (`/archivos`): pestañas por carpeta con su número, cuadrícula con la imagen de cada archivo (pasa por `/api/archivos`, que firma una URL de minutos, RN-ARC-08), y a la derecha el elegido con vista previa, nombre, tamaño, fecha, carpeta, descargar y sus versiones con la vigente marcada (RN-ARC-03); "Subir archivo" solo a quien tiene "Subir archivos" (RN-EST-15, `can_write_file()`), con la carpeta elegida. R36 y R37 (`/usuarios`): pestañas Usuarios · Invitar usuario, la tabla con nombre, rol, correo, ámbito, estado y los siete permisos con su marca, y "Editar permisos" y retirar acceso en la fila a quien puede. R38: los datos del restaurante y su foto (los mismos formularios de RN-EST-11 y RN-EST-18) y el aviso de que no cambian la web. R39: notificaciones y seguridad llevan a "Mi cuenta", donde viven; la zona horaria es la del espacio y se dice cuál. R40 y R44: la ayuda y las fuentes de siempre con la misma barra de pestañas (`SettingsTabs`). No se copia: "Subido por" (identidad del equipo, P7), "Marcar como principal" (usar una foto en la web es una solicitud, y se enlaza), "Cambiar contraseña" (la aplicación no lo tiene), una zona horaria por usuario (la fija el espacio), la tabla de avisos por evento y canal (las preferencias que existen son las de "Mi cuenta") ni el formulario de "Contactar" con asunto (se escribe en Mensajes) | `restaurantes/[id]/archivos/`, `restaurantes/[id]/usuarios/`, `restaurantes/[id]/ajustes/`, `components/panel/SettingsTabs.tsx` |
| 23/09/2026 | **G02 y G03 · Crear espacio de mantenimiento y solicitud enviada** · `/solicitar-espacio` con dos caras según el estado. G02 (sin solicitud, borrador o "Necesita información"): "Datos del negocio", "Uso previsto", "Plan solicitado" y "Datos fiscales" en cuatro tarjetas, "¿Qué pasa después?" en tres pasos a la derecha y abajo el aviso ("solo espacios de mantenimiento", "enviar no activa ni cobra") con "Guardar borrador" y "Enviar solicitud". Pro y Agency son tarjetas con su precio de `CUOTLY_PLAN_TERMS` (149 € y 499 € + IVA, RN-SUB-01), no escritos a mano. Con "Necesita información", lo que Cuotly pidió va arriba (RN-PLA-06); si el servidor rechaza algo, lo escrito se repone. G03 (enviada, en revisión, aprobada o rechazada): "Hemos recibido tu solicitud" con su estado, Negocio · Plan · Responsable, y "Estado de la solicitud" en los cuatro pasos del dibujo (`spaceRequestSteps()`): la aprobación trae las instrucciones de pago porque aprobar emite la primera mensualidad, y la activación solo se marca cuando el espacio pasa a `active` al pagarla (RN-PLA-05, RN-SUB-05). "Ver datos enviados" despliega los nueve campos; "Volver al inicio", "Entrar en tu espacio" en una aprobada y "Enviar otra solicitud" en una rechazada. Cada fila de Mis solicitudes abre la suya (`?solicitud=`). No se copia: los ejemplos con nombres ("Ej. Restavor", "Ej. Bosco García"), que serían datos inventados; los campos llevan pistas de formato | `(global)/solicitar-espacio/`, `core/space-requests.ts` |
| 23/09/2026 | **G04 · Mis solicitudes** · "Crear espacio de mantenimiento" arriba a la derecha; buscador y "Todos los estados" en la barra de filtros; tabla con Espacio (negocio y razón social), Plan solicitado con su precio de `CUOTLY_PLAN_TERMS`, Fecha (la de envío, o la de creación en un borrador), Estado y Acción. La acción es la que toca ahora (RN-GLO-04, `myRequestAction()`): "Continuar" un borrador, "Ver solicitud" mientras Cuotly la revisa, "Completar datos" —la única en verde y con la fila resaltada— si pidió información, "Ver instrucciones" en una aprobada cuya primera mensualidad está sin pagar (lleva a la suscripción del espacio, donde está el cobro), "Entrar en el espacio" cuando ya está activo y "Ver motivo" en una rechazada; la insignia dice "Aprobada · Pago pendiente" o "Aprobada · Espacio activo" según el espacio. Debajo, la franja "Información solicitada" con lo que Cuotly pidió y "Aportar información", y la nota de que las solicitudes de trabajo viven en cada espacio o panel. **Arreglado de paso:** la política de `space_requests` deja a quien aprueba en la plataforma leer todas las enviadas, y esta pantalla y el Inicio no filtraban por quien mira: a Bosco le salían las solicitudes de los demás como suyas. Ahora las dos consultas llevan `requester_id` | `(global)/mis-solicitudes/`, `core/my-space-requests.ts`, `(global)/global-load.ts` |
| 23/09/2026 | **G05 · Mi cuenta** · tres pestañas que son direcciones (`?seccion=`). **Perfil** es la vista del dibujo: "Datos personales" con la inicial o la foto y "Cambiar foto" al lado (elegir la imagen la sube; sin JavaScript sale un botón), nombre, apellidos, correo, teléfono y zona horaria como desplegable ("La de cada espacio" o una de las del servidor, que `set_my_profile()` vuelve a comprobar) con "Guardar cambios"; "Seguridad" con "Configurar verificación en dos pasos", "Ver sesiones", la nota de que los roles dependen de cada espacio y restaurante, y "Cerrar sesión"; "Preferencias de notificación" con un interruptor por canal (en la app y correo) que guarda la fila al cambiarlo. **Seguridad** abre esa tarjeta sola y añade "Cerrar mi cuenta"; **Notificaciones** abre la tabla entera con el tercer canal, el móvil. Los avisos obligatorios de RN-NOT-03 salen bloqueados con su motivo. No se copia: "Cambiar contraseña" (la aplicación no tiene esa operación) ni el idioma (hay uno solo, RN-GLO-06). Se quita el enlace "Verificar mi correo", que llevaba al segundo paso de la verificación y no a verificar ningún correo: a esa pantalla ya lleva `proxy.ts` a quien le toca | `(global)/cuenta/` |
| 23/09/2026 | **G07 y G08 · Mensajes** · la bandeja en una sola caja como el dibujo: pestañas Mantenimiento y Restaurantes con lo que hay sin leer de cada lado (lo cuenta el servidor), la fila de filtros con "Espacio:" o "Panel:", "Buscar conversación…" y el interruptor "Sin leer" (se aplican solos al cambiarlos; todo vive en la dirección), la lista a la izquierda agrupada por espacio o por restaurante con su número (plegable), cada conversación con su icono, su nombre ("Restaurante · Solicitud SOL-0003", "General", "Interno" en la de un trabajo), la hora y su círculo rojo de sin leer; y a la derecha la conversación abierta con su cabecera ("Espacio / Restaurante" o "Panel de … / Equipo de mantenimiento"), el botón al sitio donde vive ("Abrir solicitud", "Abrir trabajo", "Abrir restaurante", "Abrir panel") y, del lado del equipo, si el restaurante la lee o no (RN-MSG-04). **La conversación cambia de aspecto en todas las pantallas que la usan** (la bandeja, R20 y las solicitudes y trabajos del equipo): burbujas con lo propio a la derecha en verde y lo de los demás a la izquierda con su inicial —o un edificio para el equipo cuando mira el restaurante, P7—, los adjuntos como tarjeta con su descarga, y la caja de escribir en una fila con el clip, el texto y "Enviar". Es el mismo componente de siempre: quién firma cada mensaje lo sigue decidiendo el servidor. No se copia: abrir una conversación sola al entrar (abrirla la marca como leída, RN-MSG-06, y se borraría el aviso sin que nadie la haya visto), la línea de participantes ("Bosco · Marta · Cliente autorizado", que no devuelve ninguna función), la insignia con el nombre del espacio en la pestaña del restaurante (el cliente no lee `spaces`) ni el menú de tres puntos sin acciones decididas | `(global)/mensajes/`, `core/global-inbox.ts`, `components/conversation/` |
| 23/09/2026 | **G06 · Ayuda** · "¿En qué podemos ayudarte?" con el buscador a lo ancho; una tarjeta por cada tema que tiene guías (icono, frase, cuántos artículos y "Ver artículos", que filtra por ese tema); "Preguntas frecuentes" plegables, la primera abierta, con el principio de la guía y "Leer la guía completa" (primero las del rol de quien mira, RN-SOP-11); y "Contactar con soporte de Cuotly" con el horario de soporte humano, si ahora hay alguien, y el estado de Cuotly. **Arreglado de paso:** la Ayuda global enlazaba sus guías a `/ayuda/guias/…` y esa ruta no existía (404); ahora sí, con el mismo `HelpArticle`. No se copia el formulario de "Asunto" y "Descripción": una consulta a Cuotly es una incidencia de RN-SOP-03 (RN-GLO-07), con sus propios campos y de un espacio, así que la tarjeta ofrece "Abrir consulta en <espacio>" en cada espacio donde quien mira puede (`contact_cuotly`), y a quien no puede le dice a quién pedírselo (al restaurante, que escriba a su equipo desde Mensajes) | `(global)/ayuda/`, `core/global-help.ts` |
| 23/09/2026 | **Panel del restaurante · Actividad e historial (R41)** · `/actividad`, enlazada desde "Actividad reciente" del Inicio ("Ver actividad e historial"). "Fecha" con el mes y sus flechas, "Tipo de actividad" (Solicitudes, Menú Diario, Informes, Pagos y facturas, Archivos) y "N eventos encontrados"; la línea de tiempo del mes con el icono, el día y la hora, qué pasó, una frase con el código o el nombre de la cosa y su tipo; y a la derecha "Detalle del evento" con el botón a donde vive ("Ver solicitud", "Ver menú", "Ver cobro"…). Los hechos los da **`client_activity()` (migración 128)**: la fecha de cada hecho en su tabla, como el relato del informe del mes (RN-REP-18), **sin ninguna identidad** (P7) y con la visibilidad de cada tabla —sin "Ver facturación" no hay cobros ni pagos (RN-FIN-07)—. No sale de `audit_log` porque su política deja al cliente fuera a propósito. El mes se corta en la zona del espacio. No se copia: "Evidencia pública" con la captura de la web (ningún hecho lleva una imagen de la web publicada que el restaurante pueda leer) ni "Datos de ejemplo" | `restaurantes/[id]/actividad/`, `core/client-activity.ts`, migración 128, suite 69 |
| 23/09/2026 | **M09 · Trabajos en vista Tablero** · el dibujo solo pinta la pestaña, así que el tablero sigue su lenguaje: una columna por estado en el orden de §11.1 (las once, también las vacías, más estrechas), cada una con su punto de color, su nombre y su número, sobre fondo suave; y en cada tarjeta lo mismo que en la fila de la lista: el código, el aviso de plazo si lo hay ("Fuera de plazo", "Quedan 2 h 30 min para entregar", del reloj laborable de `loadSpaceAttention()`, la misma cuenta que "Necesita atención" del Inicio), el título (el resumen validado o lo que escribió el restaurante), el restaurante, quién lo lleva con su avatar, la categoría y el puesto que le dio su restaurante. La tarjeta fuera de plazo lleva el borde rojo. **No se arrastra**: mover de columna es cambiar el estado, que tiene su regla, su evento y su auditoría (RN-JOB), y se hace desde el trabajo. Arreglado de paso: los textos solo para lector de pantalla del tablero ensanchaban la página entera | `espacios/[slug]/trabajos/JobBoard.tsx`, `core/job-board.ts` |

Lo que estas pantallas **no** copian del dibujo, y por qué, está escrito en el
comentario de cada una: los botones que abrirían formularios que no existen
("Nueva solicitud" del equipo, "Nuevo trabajo", "Programar menú", "Crear
plan"), los selectores de periodo con una sola opción, el menú de tres puntos
sin acciones decididas, y el "Supervisor" de M02, que aquí es el responsable
(RN-EST-19).

## Cómo se comprueba cada parte

1. `pnpm typecheck && pnpm lint && pnpm test` al terminar cada una.
2. Toda `RN-xxx` que se toque, con un test que cite su número.
3. Lo que se pueda ver sin sesión, se mira de verdad en el navegador.
4. Lo que necesita datos, se comprueba en la máquina de Bosco o en Vercel:
   desde este entorno no hay salida a Supabase.
