# Plan del diseño definitivo móvil, por partes

Escrito el 24/09/2026, después de recorrer otra vez las 157 páginas de
`docs/diseno/Cuotly_movil.pdf`, esta vez **contra la web con datos** y no
contra el código. Es el equivalente de `PLAN-ESCRITORIO.md` para el paso 3
del orden de la decisión 37.

`MAPA-DEL-DISENO-MOVIL.md` dice qué pide el PDF y qué de eso no existía;
`PROPUESTA-DISENO-MOVIL.md`, qué había que decidir. Las dos cosas están
cerradas. Este documento contesta lo que queda: **dónde se aplica el diseño,
en qué orden y cómo se comprueba**.

## La decisión de partida (decisión 76)

El PDF móvil **no es una app reducida**: es el producto entero a ancho de
teléfono, con las mismas pantallas que el de escritorio. Había dos sitios
donde aplicarlo:

- **La web en el teléfono** (`cuotly-web`), que ya tiene las 157 pantallas
  con sus datos y, desde la decisión 47, la barra inferior del diseño.
- **La app de Expo** (`cuotly-movil`), que tiene 29 pantallas y los once
  flujos de §176.

Bosco eligió el 24/09/2026 **la web**. El trabajo es de forma, no de
construir: ninguna pantalla nueva, ningún dato nuevo. La app de Expo se
decide aparte, cuando toque llevarla a las tiendas (paso 7).

## Cómo se comprueba: la web con datos en local

Este entorno no llega al proyecto real de Supabase y Docker Hub limita las
descargas, así que `supabase start` no arranca. `scripts/supabase-local/`
monta lo mínimo para ver cada pantalla con los datos del espacio de
demostración:

```bash
bash scripts/supabase-local/arrancar.sh      # PostgreSQL + PostgREST + pasarela + next dev
node scripts/supabase-local/barrido.mjs owner@cuotly.test /tmp/capturas /espacios/demo /espacios/demo/solicitudes
```

`arrancar.sh` aplica el bootstrap de las suites, las 135 migraciones y
`supabase/seed/espacio-demo.sql`; la pasarela comprueba las contraseñas
contra `auth.users` y firma los tokens, así que **RLS y las funciones son
las de verdad**. Lo que no hay es Storage: las fotos y las descargas no
cargan, y las pantallas lo dicen.

`barrido.mjs` abre cada ruta a 390 × 844, dice si la página se sale por la
derecha y qué elemento lo causa, y guarda una captura de página entera para
ponerla al lado de la del PDF.

## Lo que se repite en las 157 páginas

El PDF no inventa una pantalla por cada vista: aplica **seis patrones** a
las mismas pantallas de escritorio. Se arreglan una vez, en el componente
común, y no pantalla a pantalla.

| # | Patrón del diseño | Cómo estaba la web | Dónde se arregla |
|---|---|---|---|
| P1 | Bajo el logotipo, la **tarjeta de contexto**: el espacio con su rol y "Cambiar de espacio", o el restaurante con su selector | Una miga de pan "⌂ › Demo Cuotly › Inicio" | `AppShell` · **hecho (24/09)** |
| P2 | Ninguna pantalla más ancha que el teléfono | Cuatro se salían: Resumen de la ficha (887 px), Gestión · Usuarios (562 px), calendario del panel (658 px) e Inicio del panel (593 px) | `Card` con `min-w-0`, rejillas con `grid-cols-1` · **hecho (24/09)** |
| P3 | Las **tablas son tarjetas apiladas**: el título arriba y los demás datos en parejas etiqueta–valor | Tablas con desplazamiento lateral dentro de su caja (39 pantallas) | `components/ui/Table.tsx`, una vez · **hecho (24/09)** |
| P4 | Las **pestañas se reparten en filas** que caben enteras | Una fila con desplazamiento lateral | `components/ui/Tabs.tsx` y las pestañas de la ficha · **hecho (24/09)** |
| P5 | Los **filtros van en una fila** de dos o tres desplegables | Uno debajo de otro a lo ancho, con "Filtrar" | `components/ui/FilterBar.tsx` · **hecho (24/09)** |
| P6 | Las **cifras de resumen en tres columnas** pequeñas | Dos columnas de tarjetas grandes | `components/ui/StatCard.tsx` y sus rejillas · **hecho (24/09)** |

Y dos cosas del PDF que **no se copian**, por el mismo motivo que en
escritorio:

- **El tamaño de letra.** El PDF pinta a 9–10 px buena parte del texto. En
  un teléfono de verdad eso no se lee, y §21.4 pide texto legible. Se copia
  la disposición (cuántas columnas, qué va junto), no el cuerpo de letra.
- **Los datos de ejemplo** ("Datos de ejemplo" está escrito en muchas
  páginas). Igual que en escritorio (CLAUDE.md).

## Las partes

Las mismas doce de escritorio, con las páginas del PDF móvil. Se hacen
**después** de los seis patrones, porque la mayoría de lo que falta en cada
parte es alguno de ellos.

| # | Parte | Páginas | Rutas |
|---|---|---|---|
| 1 | Contexto global | 1–8 | `/`, `/solicitar-espacio`, `/mis-solicitudes`, `/mensajes`, `/cuenta`, `/ayuda` |
| 2 | Acceso a Cuotly y estados | 9–21 | `/solicitar-acceso`, `/estado/*`, `/sesion-caducada` |
| 3 | Espacio · Inicio y Restaurantes | 22, 23, 57, 59, 60 | `/espacios/<e>`, `/restaurantes`, `/grupos`, `/archivados` |
| 4 | Ficha del restaurante | 24–56, 58, 61 | `/restaurantes/<id>?vista=…` y los detalles con su marco |
| 5 | Solicitudes, Trabajos y Tareas | 62–69 | `/solicitudes`, `/trabajos` (lista y tablero), `/tareas` |
| 6 | Menú Diario, Mensajes y Calendario | 70–76 | `/menu-diario`, `/mensajes`, `/mensajes/canales`, `/calendario` |
| 7 | Finanzas | 77–82 | `/finanzas?tab=…`, `/finanzas/cobros/<id>`, `/finanzas/presupuestos` |
| 8 | Informes | 83–87 | `/informes?tab=…` |
| 9 | Equipo, Planes, Agente y Ajustes | 88–109 | `/equipo`, `/planes`, `/agente`, `/ajustes` |
| 10 | Panel · Inicio y Solicitudes | 110–123 | `/restaurantes/<id>`, `/actividad`, `/solicitudes` |
| 11 | Panel · Menú Diario, Mensajes y Calendario | 124–135 | `/menu-diario/*`, `/mensajes`, `/calendario` |
| 12 | Panel · Plan, Pagos, Informes, Archivos, Usuarios y Ajustes | 136–157 | `/plan`, `/facturacion`, `/datos`, `/archivos`, `/usuarios`, `/ajustes`, `/fuentes` |

## Primer barrido (24/09/2026)

107 direcciones recorridas a 390 px con las dos identidades que lo cubren
todo: la propietaria del espacio (contexto global, espacio y ficha) y la
propietaria de Magariños (el panel del restaurante).

- **Cuatro pantallas se salían** por la derecha, y es el único defecto que
  un usuario nota sin comparar con nada: la página entera se desplaza de
  lado. Las cuatro por lo mismo: una rejilla o una tarjeta que se ensancha
  hasta su contenido más largo. Arregladas en la raíz (`Card` con
  `min-w-0`) y en las dos rejillas sin columnas declaradas.
- **Ninguna otra se sale.** Las tablas (39 pantallas) y el tablero de
  Trabajos se desplazan dentro de su propia caja, que funciona pero no es
  el diseño: son P3 y la vista Tablero de la parte 5.

## Registro

| Fecha | Qué | Dónde |
|---|---|---|
| 24/09/2026 | **Decisión 76, el entorno local y P1–P2** · el diseño móvil se aplica a la web. `scripts/supabase-local/` para ver la web con datos sin salida a Supabase. P1: la tarjeta de contexto bajo la cabecera en espacio y panel (el selector del panel, el mismo de escritorio en claro); en el contexto global no hay fila. El avatar pasa al verde oscuro de los dos diseños. P2: `Card` con `min-w-0`; `grid-cols-1` en el Inicio del panel y en su calendario, que además pinta en móvil solo el punto de cada evento (el texto sigue para el lector de pantalla) | `components/shell/AppShell.tsx`, `components/ui/Card.tsx`, `components/panel/PanelHome.tsx`, `restaurantes/[id]/calendario/page.tsx`, `scripts/supabase-local/` |
| 24/09/2026 | **P3 · las tablas son tarjetas en el teléfono** · por debajo de `sm`, cada fila de `<Table>` se apila: la primera celda arriba, a lo ancho, y las demás en dos columnas de etiqueta y valor. Las etiquetas salen de la cabecera **en el servidor** —`Table` recorre `TableHead › TableRow › TableHeaderCell`— y viajan como variables CSS (`--tabla-cN`) que pinta `::before`, así que ninguna pantalla cambia y no hay JavaScript en el navegador. Una cabecera que solo es para el lector de pantalla (`sr-only`) no se pinta como etiqueta. Los `role` de tabla, fila y celda van explícitos porque al dejar de ser `table-row` Safari y Chrome quitan la semántica. `stack={false}` deja una rejilla como tabla. Comprobado en Solicitudes, Trabajos, Equipo, Finanzas, la ficha y el panel | `components/ui/Table.tsx`, `styles/tokens.css`, `components/ui/table-stack.test.tsx` |
| 24/09/2026 | **P4 · todas las pestañas a la vista, y la cabecera de la ficha compacta** · `Tabs` se reparte en filas por debajo de `sm` (subpestañas de la ficha, Ajustes, Equipo, Finanzas…); las cinco de la ficha van en una rejilla de cinco columnas con el nombre en dos líneas si no cabe, como en las páginas 24 a 52. La cabecera de la ficha baja en el teléfono a foto de 56 px, nombre a 20 px y botones pequeños. Ninguna pestaña queda ya fuera de la pantalla en el barrido | `components/ui/Tabs.tsx`, `components/establishment/SheetHeader.tsx`, `components/ui/tabs-movil.test.ts` |
| 24/09/2026 | **P5 y P6 · filtros en una fila y cifras compactas** · `FilterBar` es en el teléfono una rejilla que pone tantos desplegables por fila como quepan (tres a 390 px, como la página 23), con el buscador y los botones a lo ancho. `StatCard` se compacta (margen, icono y cifra más pequeños, icono encima de la etiqueta por debajo de 480 px, sin bajar de 12 px) y sus rejillas siguen al PDF: tres arriba y dos debajo en el Inicio del espacio, dos por fila en Finanzas, Informes y Equipo. `arrancar.sh` da ya la clave de servicio, sin la que Informes decía que no pudo calcular las cifras | `components/ui/FilterBar.tsx`, `components/ui/StatCard.tsx`, `espacios/[slug]/page.tsx`, `informes/SpaceReportsView.tsx`, `finanzas/FinanceView.tsx`, `equipo/TeamView.tsx`, `scripts/supabase-local/arrancar.sh` |
| 24/09/2026 | **Parte 1 · contexto global (páginas 1 a 8)** · comparadas Inicio, Crear espacio, Mis solicitudes, Mensajes, Mi cuenta y Ayuda. **Inicio**: cada aviso de "Necesita tu atención" es una fila con icono, título y "Abrir" a la derecha y la etiqueta debajo (antes se partía en tres líneas y ocupaba media pantalla). **Mensajes**: sin conversación elegida ya no se pinta el hueco "Elige una conversación" bajo la lista. **Crear espacio**: los dos números de "Uso previsto" en dos columnas. Todos los títulos de página bajan a 22 px en el teléfono (`PageHeader`). **Lo que no se copia**: los formularios del dibujo a dos columnas con datos largos (negocio, datos fiscales, perfil); a nuestro cuerpo de letra cortaban lo escrito ("owner@cuotly.te"), así que van a una | `(global)/AttentionBoard.tsx`, `(global)/mensajes/InboxView.tsx`, `solicitar-espacio/SpaceRequestForm.tsx`, `components/ui/PageHeader.tsx` |
| 24/09/2026 | **Parte 2 · acceso a Cuotly y estados (páginas 9 a 21)** · comparados la solicitud de acceso, la invitación que no vale, el acceso retirado, el elemento no disponible y la sesión caducada: el contenido coincide y lo que sobraba era tamaño. La cabecera pública cabe en una línea (antes partía "Mi cuenta" y "Cerrar sesión"); el título de la solicitud baja de 34 a 24 px y los de los estados de 30 a 22, con la ilustración a 64 px y menos margen. Los campos del formulario se quedan más altos que en el dibujo: por debajo de 16 px el iPhone amplía la página al tocarlos. `barrido.mjs` acepta `-` como correo para las pantallas sin sesión | `components/access/AccessShell.tsx`, `components/access/AccessPieces.tsx`, `(auth)/signup/AccessRequestForm.tsx`, `scripts/supabase-local/barrido.mjs` |
| 24/09/2026 | **Parte 3 · Inicio del espacio y Restaurantes (páginas 22, 23, 57, 59, 60)** · Restaurantes: cada tarjeta lleva Grupo, Solicitudes y Responsable en una fila de tres también en el teléfono, con los rótulos partiéndose en vez de cortarse; "Necesita atención" debajo a lo ancho. La acción principal de cada pantalla (`PageHeader`) va a lo ancho en el teléfono, como "Crear establecimiento" y "Crear grupo" en el dibujo. Inicio: en "Necesita atención" la etiqueta baja bajo el título, que antes quedaba en "TRB-00…". Grupos y Archivados ya cuadraban con los patrones comunes | `components/establishment/EstablishmentCard.tsx`, `components/ui/PageHeader.tsx`, `components/home/AttentionList.tsx` |
| 24/09/2026 | **Parte 4 · la ficha del restaurante (páginas 24 a 56)** · recorridas las cinco pestañas, los nueve bloques de Gestión y los detalles con su marco. **Cabecera**: en el teléfono no lleva la línea de lo incluido en el plan (tres líneas; el dibujo no la pone y está entera en el Resumen). **Resumen**: "Consumos del ciclo" es una fila fina por categoría con su barra; lo que queda solo se escribe si está agotado o hubo devoluciones. **Tarjetas apiladas**: las insignias largas parten línea en vez de montarse ("46 h 1 min para publicar"), `PersonCell` no se sale, y una celda con formulario (retirar un acceso con su motivo) ocupa toda la fila. **Historial**: la columna "Cambios" ya no enseña identificadores internos ni listas de ellos (`auditListedChanges()`; el detalle y el CSV siguen enteros, P4). **Detalles** (solicitud, trabajo, tarea, menú, informe) y el alta: el título baja a 22 px en el teléfono. **Lo que no se copia**: Gestión · Datos sigue siendo el formulario editable, no la lista de solo lectura con "Editar" del dibujo | `components/establishment/SheetHeader.tsx`, `components/establishment/Sheet.tsx`, `styles/tokens.css`, `components/ui/StatusBadge.tsx`, `components/ui/Avatar.tsx`, `core/audit.ts`, las páginas de detalle |
| 24/09/2026 | **Parte 5 · Solicitudes, Trabajos y Tareas (páginas 62 a 69)** · las tres listas cuadran con los patrones comunes (tarjetas apiladas, filtros en rejilla, acción a lo ancho). El tablero de Trabajos sigue siendo de columnas que se desplazan de lado, que es como funciona un tablero; el PDF no lo dibuja en móvil. **Fallo real encontrado**: la columna Comentarios de Trabajos decía "No se pudo leer" en todas las filas, también en escritorio. Pedía el recuento incrustado de PostgREST sobre `messages`, que tiene el `select` concedido por columnas (CLAUDE.md), y la base lo rechazaba. Ahora se piden los `id` y se cuentan; un barrido (`core/conteo-incrustado.test.ts`) falla si alguien vuelve a pedir un recuento incrustado sobre cualquiera de las dieciocho tablas de la lista | `trabajos/list-extras-load.ts`, `core/conteo-incrustado.test.ts` |
| 24/09/2026 | **Parte 6 · Menú Diario, Mensajes y Calendario (páginas 70 a 76)** · **Fallo real encontrado**: toda conversación de solicitud o de trabajo abierta desde Mensajes del espacio salía sin un solo mensaje, también en escritorio. La página preguntaba el restaurante a `conversation_establishment_id()` por RPC, y esa función es interna (revocada a `authenticated` en la migración 26). Ahora lo lee de la solicitud o del trabajo, que pasan por su RLS; no se abre la función. Un barrido nuevo (`core/rpc-revocadas.test.ts`) recorre las migraciones, se queda con las funciones que acaban sin `execute` para `authenticated` y falla si una pantalla las llama con la sesión de quien mira. **Diseño**: la conversación sin rejilla que la ensanchaba (459 px); diez pantallas con margen doble (`p-8` dentro del del armazón) lo pierden en el teléfono; el Calendario usa la barra de filtros común y escribe el día como se lee ("29 sept") en vez de "2026-09-29" | `mensajes/[id]/page.tsx`, `core/rpc-revocadas.test.ts`, `calendario/page.tsx`, diez páginas con `sm:p-8` |
| 24/09/2026 | **Parte 7 · Finanzas (páginas 77 a 82)** · recorridas Resumen, Cobros, Pagos, Presupuestos, Facturas, Vencimientos y el detalle de cobro: cuadran con los patrones comunes. Retoques: la gráfica "Cobros mensuales" baja a 128 px en el teléfono (era 208); en Pagos, el selector va a lo ancho y las tres cifras en dos columnas; en Presupuestos y Vencimientos no se pinta el detalle vacío ("Elige un presupuesto") bajo la lista mientras no hay nada elegido. Tres cifras en fila como en el dibujo no caben a 390 px sin bajar la cifra de 22 px | `finanzas/FinanceView.tsx`, `finanzas/PaymentsTab.tsx`, `finanzas/DueTab.tsx`, `finanzas/presupuestos/QuotesListView.tsx` |
| 24/09/2026 | **Parte 8 · Informes (páginas 83 a 87)** · las cuatro pestañas cuadran con los patrones comunes. **Fallo real encontrado**: la pestaña Finanzas decía "No se han podido calcular las cifras" en cuanto el espacio tenía un cobro, y por lo mismo no se podía generar un informe financiero. `report_finance_dataset()` se llama con la clave de servicio y por dentro usaba funciones que exigen visibilidad financiera a un usuario que con esa clave no existe. Migración 136: `can_read_establishment_finance()` responde que sí a la clave de servicio (que ya se salta RLS y solo tiene el servidor); para las sesiones de usuario no cambia nada. La suite de informes tiene ahora un cobro y falla sin la migración | `supabase/migrations/20260924000136_…`, `supabase/tests/informes.sql` |
