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
3. G02/G03 · crear espacio de mantenimiento: dos columnas de formulario, la
   elección de plan **Pro 149 € / Agency 499 €** (que son los reales, RN-SUB;
   no hay nada que inventar), "¿Qué pasa después?" en tres pasos y el aviso de
   que enviar no activa ni cobra.
4. G04 · Mis solicitudes: tabla con Espacio, Plan solicitado, Fecha, Estado y
   Acción, y la franja de abajo con la que necesita información.
5. G05 · Mi cuenta: tres pestañas (Perfil · Seguridad · Notificaciones) en una
   sola pantalla. Hoy son rutas sueltas y **no existe el perfil** (nombre,
   apellidos, teléfono, idioma, zona horaria) ni las preferencias de aviso.
6. G06 · Ayuda: buscador, cuatro categorías, preguntas frecuentes plegables y
   el formulario de contacto con soporte.
7. G07/G08 · Mensajes: pestañas Mantenimiento / Restaurantes con su contador,
   selector de espacio, filtro "Sin leer", lista a la izquierda y conversación
   a la derecha con su cabecera y su caja de escribir.

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

## Cómo se comprueba cada parte

1. `pnpm typecheck && pnpm lint && pnpm test` al terminar cada una.
2. Toda `RN-xxx` que se toque, con un test que cite su número.
3. Lo que se pueda ver sin sesión, se mira de verdad en el navegador.
4. Lo que necesita datos, se comprueba en la máquina de Bosco o en Vercel:
   desde este entorno no hay salida a Supabase.
