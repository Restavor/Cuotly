# Mapa del diseño móvil

Levantado el 19/09/2026, leyendo entero `docs/diseno/Cuotly_movil.pdf` (157
páginas, sin texto extraíble: son imágenes). Es el equivalente móvil de
`MAPA-DEL-DISENO.md` y la segunda mitad del paso 3, la que esperaba al PDF.

Se lee junto a `ESTADO-DE-LA-APP-MOVIL.md`, que dice qué tiene hoy
`apps/mobile` y qué se le quedó atrás.

---

## 1 · Lo primero, porque cambia el tamaño del trabajo

**El PDF no es el diseño de una app móvil reducida: es el producto entero a
ancho de teléfono.** Las 157 páginas cubren lo mismo que el diseño de
escritorio —contexto global, espacio de mantenimiento completo, panel del
restaurante completo, ajustes, planes, informes, auditoría— con la misma
densidad: migas de pan, pestañas de dos niveles, tablas con cabecera,
paginación "Anterior 1 Siguiente" y tarjetas con columnas.

Hoy `apps/mobile` tiene **29 pantallas** y cubre los once flujos de §176. Lo
que no trae, lo dice y remite a la web (RN-MOV-03). Aplicar este PDF "tal
cual" a la app de Expo significa llevarla a **paridad completa** con la web,
no ajustar lo que hay.

Lo que sí es nuevo y propio de móvil en todo el documento es **una sola cosa**:

- **Una barra inferior de cinco con botón central** — Inicio · Restaurantes ·
  **Crear (+)** · Mensajes · Más — **igual para todos los roles y también
  fuera de todo espacio**. Es la misma barra en el contexto global, en el
  espacio de mantenimiento y en el panel del restaurante.

Todo lo demás del PDF es disposición estrecha del mismo producto.

## 2 · Qué hay en las 157 páginas

| Páginas | Bloque |
| --- | --- |
| 1-8 | Contexto global: Inicio, Crear espacio, Mis solicitudes, Mensajes (Mantenimiento/Restaurantes), Mi cuenta, Ayuda |
| 9-16 | Solicitud de acceso a Cuotly, con sus cuatro estados, validación, error de envío, sin conexión y aviso de salida |
| 17-20 | Estados de error: invitación caducada, acceso retirado, elemento no disponible, sesión caducada |
| 21-28 | Espacio: Inicio, Restaurantes, ficha con las cinco pestañas (Resumen, Operación, Informes y datos, Gestión, Historial) |
| 29-36 | Ficha · Operación: solicitudes, trabajos, tareas y Menú Diario, con sus detalles |
| 37-45 | Ficha · Informes y datos: analítica, búsqueda, comportamiento, rendimiento, oportunidades e informe mensual |
| 46-52 | Ficha · Gestión: datos, plan y servicios, pagos, usuarios, archivos, integraciones y notas internas |
| 53-62 | Crear establecimiento, solo lectura, crear panel, grupos, copias de seguridad, archivados y estados vacíos |
| 63-74 | Espacio: solicitudes, trabajos (Lista/Tablero), tareas, Menú Diario y mensajes (Clientes/Internos, con canales) |
| 75-87 | Calendario, Finanzas (resumen, cobros, presupuestos, pagos parciales, facturas) e Informes |
| 88-98 | Equipo (miembros, permisos, invitaciones, supervisión) y Planes y servicios (planes, servicios, versiones) |
| 99-109 | Agente Cuotly ("Próximamente") y Ajustes del espacio: general, horarios, impuestos, integraciones, suscripción, seguridad, auditoría, notificaciones |
| 110-122 | Panel del restaurante: inicio, primeros pasos, solo lectura, solicitudes y su ciclo completo |
| 123-135 | Panel: Menú Diario entero (editor, plantillas, vista previa, publicación, versiones, edición simultánea), mensajes y calendario |
| 136-146 | Panel: plan y servicios, cambio o baja, pagos y facturas, informes y datos |
| 147-157 | Panel: estados sin conectar, archivos, usuarios y accesos, ajustes y ayuda |

## 3 · Lo que el diseño confirma de lo que ya está construido

Vale la pena decirlo porque es la mayor parte, y porque significa que el
servidor no se toca:

- Las **cinco pestañas** de la ficha y las **seis secciones** de Informes y
  datos, tal cual.
- El ciclo de la solicitud: clasificación propuesta, cuota del plan,
  "Validar clasificación / Pedir información / Preparar presupuesto", y del
  lado cliente "Aceptar propuesta" con el consumo antes y después (8/25 → 9/25).
- **Precios y cuotas correctos** en las pantallas que mandan: Básico 99 €,
  Premium 499 €, Premium+ 599 €, Menú Diario 229 € y **199 € con Premium+**,
  30 actualizaciones, 3 plantillas, compromiso de 3 meses, activación en 24 h
  laborables. Coincide con la decisión 39 y con CLAUDE.md.
- **Transferencia entre espacios**, **copias de seguridad** con sus
  limitaciones escritas ("no incluye hosting, no se respaldan credenciales,
  la restauración no está garantizada") y **canales internos**: las tres del
  grupo C, como se construyeron.
- **Edición simultánea del menú** con comparación de versiones (A17), y
  **copiar borrador a otro restaurante del grupo** (R07).
- **Pagos parciales y justificantes**, con "enviar un justificante no
  confirma el pago".
- El **selector de restaurante del panel** con "Volver al inicio de Cuotly"
  (página 112) es exactamente lo que se construyó el 17/09 como RN-PAN-04/06.
- P7 respetado: el cliente ve "Equipo de mantenimiento" como interlocutor y
  como autor de versiones de archivo, nunca un nombre.
- Estados vacíos, de carga, de error y de sin conexión, con su motivo escrito.

## 4 · Lo que NO se copia: datos de ejemplo

El PDF marca "Datos de ejemplo" en muchas pantallas y CLAUDE.md lo prohíbe
expresamente. Dentro de esos datos hay **nombres de plan inventados** que
contradicen la decisión 39 —"Estándar", "Profesional", "Plan Esencial"— en
las tarjetas de listado (páginas 23, 78, 86). En las pantallas que de verdad
definen los planes (93 a 97) los nombres y los precios son los correctos.

**Son relleno, no diseño. No se copian y no hace falta preguntar por ellos.**

## 5 · Lo que hay que decidir antes de construir

Estas sí son diferencias reales con lo decidido o con lo que existe. Ninguna
se resuelve por cuenta propia (CLAUDE.md).

### 5.1 · Alérgenos: el diseño y la decisión 45 no dicen lo mismo

La página 125 trae, en el editor del menú del panel, un campo de **texto
libre** titulado "Alérgenos (según la información proporcionada)", de 200
caracteres, para todo el menú: *"Contiene gluten, lácteos y frutos secos."*

La **decisión 45 del 17/09/2026** —dos días antes de este PDF— decidió lo
contrario y ya está construido (§39, RN-ALE-01 a 09, migración 101, suite 52):
**plato a plato**, los catorce del Reglamento UE 1169/2011 con casillas, más
una nota libre **por plato**, distinguiendo "sin declarar" de "sin alérgenos".

No es un matiz de forma: es otro modelo de datos y otra obligación legal.

### 5.2 · El menú: un plato ya no es una línea de texto

Las páginas 129 y 131 enseñan platos **con foto y precio individual**, y la
125 los enseña **reordenables arrastrando**. Hoy un plato es una línea de
texto dentro de `text[]`, y RN-ALE-09 ata la declaración de alérgenos **a la
posición** del plato — algo que se pudo hacer porque una versión de menú es
inmutable y las posiciones no se mueven solas. Arrastrar para reordenar
rompería justo esa garantía.

### 5.3 · "Crear panel del restaurante" como acto explícito

Páginas 27, 46, 53 y 56: la ficha enseña "Panel del restaurante · **No
creado**" y un formulario para crearlo, eligiendo propietario y enviando
invitación. Hoy el panel **no se crea**: existe en cuanto alguien del lado
cliente tiene acceso al restaurante.

### 5.4 · Permisos del cliente más finos

Páginas 152-153: siete permisos con casilla (crear solicitudes, editar
menús, mensajes, subir archivos, consultar informes, pagos y facturas,
usuarios y accesos) sobre dos roles (Propietario, Editor). Hoy hay cuatro
roles y dos permisos (`edit_establishment_data`, `view_billing`).

### 5.5 · Cosas que no existen y el diseño da por hechas

- ~~**Foto de perfil** ("Cambiar foto", página 7)~~ — hecha el 19/09/2026
  (decisión 53, RN-GLO-09, migración 109) con lo que le faltaba: un sitio
  propio. `files` es por espacio y una cara no es de ningún espacio, así
  que tiene bucket aparte (`avatars`, privado).

  Al construirla apareció la **cuarta nota de este mapa que apunta mal**:
  decía que las páginas 3, 22 y 23 enseñaban avatares de persona, y la 3 es
  el estado de una solicitud de espacio, sin ninguna cara. Las caras están
  en la **22** —carga de trabajo del equipo y actividad reciente—, y las dos
  personas de esos bloques comparten espacio, que es justo lo que
  `profiles_select` permite. Las listas del **panel** (152 y 153) dibujan
  iniciales, no fotos.

  Queda fuera, y no es lo mismo: la **foto del restaurante** que la 22
  enseña en "Estado por restaurante". Esa sí es del espacio y cabe en
  `files`.
- **Supervisor de un restaurante** (página 23: "Supervisor · Diego", con su
  cara). No existe y no es un descuido: "Supervisor" en Cuotly **no es un
  cargo de un local**, es una relación Administrador–Trabajador (CLAUDE.md,
  decisión que no debe reaparecer), y `supervisions` enlaza dos personas,
  no una persona con un restaurante. La ficha de la página 23 se hizo el
  21/09/2026 sin ese bloque, con la razón escrita en `EstablishmentCard` y
  una prueba que falla si alguien lo repone. Si hiciera falta un
  **responsable por restaurante**, es una decisión de producto nueva y una
  migración, no un hueco que rellenar.
- **Foto del local** en la lista de restaurantes (página 23) y en "Estado
  por restaurante" (página 22). `establishments` no tiene ninguna columna
  de imagen. Cabría en `files`, que sí es por espacio, pero no está hecho.
  Las dos pantallas se construyeron sin foto, no con una de archivo.
- **Estado "Configurando"** de un restaurante (página 54).
- ~~**"Cuotly Insights"** como fuente de datos propia (páginas 41, 44)~~ —
  **no es una fuente**: Bosco decidió el 19/09/2026 que es el nombre del
  resumen que Cuotly ya calcula (decisión 48), y se construyó ese mismo día
  (decisión 54, RN-INT-09). Aparece entre las fuentes, como en el diseño,
  pero diciendo que no es una conexión y con el estado derivado en vez del
  "Activa" fijo que pinta el PDF.
- ~~**Almacenamiento por restaurante** (página 50: "6,4 GB")~~ — hecho el
  19/09/2026 (RN-ARC-10, migración 103).
- ~~**Frecuencia de aviso** "Instantáneo / Resumen diario" y **horario de
  recepción** (página 109)~~ — **la página no es esa**: la 109 es "Ajustes
  del espacio · General", y la pantalla de preferencias de notificaciones
  no aparece en las contiguas (110-112, 114, 116) ni junto a "Mi cuenta"
  (8). Tercera nota de este mapa que apunta mal, después de la 63 y la 46;
  la cuarta fue la de los avatares de la página 3, arriba.
  De la 109 se construyeron **las ocho pestañas** (decisión 50); la
  frecuencia y el horario siguen sin definir y no se inventan.
- ~~**Prioridad con motivo obligatorio** en la solicitud del equipo (página 63)~~ — **la lectura
  estaba mal**: la página 63 es "Nueva solicitud", la del **cliente**, no la del equipo. Resuelto
  como decisión 49 (RN-REQ-05/06, migración 106): nivel Alta/Media/Baja al crear, motivo
  obligatorio, y el orden 1..N de la migración 62 se queda vivo y aparte.
- ~~**Seis canales** de fábrica (página 74) frente a los cuatro que siembra
  la migración 100~~ — hecho el 19/09/2026 (RN-CAN-03, migración 104).
- **"Prioridad: Alta/Superior"** (página **97**, no la 96: la 96 es
  "Servicios adicionales". Quinta imprecisión de este mapa) — resuelto el
  19/09/2026
  (decisión 55, migración 110): es `plans.can_order_requests`, que desde ese
  día tienen Premium y Premium+. El **turno** frente a otros restaurantes es
  otra columna (`queue_rank`) y ese sí sigue sin verlo el cliente.
- **"Informes: Estándar/Avanzado"** (página **97**) — **en propuesta**. La
  página 97 es "Versiones de plan", y ahí "Informes" aparece en la
  comparativa junto a "Prioridad" y a los cambios incluidos, con una línea
  que dice "Se mejora el nivel de informes a Avanzado": es un **atributo
  versionado del plan**, no una regla suelta.

  El 20/09/2026 Bosco dio los niveles —**cinco**, uno por plan: básico,
  estándar, estándar+, avanzado y completo— y pidió que el informe sea "un
  resumen de todo lo que ha pasado en el mes". Qué lleva cada nivel está
  propuesto en `docs/PROPUESTA-INFORMES.md` y **pendiente de confirmar**.

### 5.6 · La barra inferior contradice §20.3

El PRD fija cinco destinos **por rol** (propietario/administrador: Inicio ·
Solicitudes · Trabajos · Mensajes · Más). El diseño pone la misma barra para
todos: Inicio · Restaurantes · Crear · Mensajes · Más.

### 5.7 · El diseño se contradice a sí mismo en un sitio

Las subpestañas de **Gestión** son distintas en la página 27 (Datos · Plan y
servicios · Pagos · Usuarios · Archivos · Integraciones · Notas internas) y
en la 58 (Usuarios y accesos · Configuración · Archivos · Copias de
seguridad). Hay que elegir una.

---

## 6 · Lo que hace falta para seguir

Las siete de arriba, decididas. Hasta entonces no se construye: son reglas y
modelo de datos, no disposición, y CLAUDE.md prohíbe inventarlas.

**Al día 19/09/2026**: tres se cerraron como **decisión 47** (5.1 alérgenos,
5.2 el plato como línea de texto, 5.6 la barra única). El resto está
planteado punto por punto, con lo que cuesta cada salida y una propuesta,
en **`docs/PROPUESTA-DISENO-MOVIL.md`** — que además corrige tres cosas que
la lectura del PDF dio por ausentes y sí existen: el estado `configuring`,
las notas internas (migraciones 66 y 67) y las copias de seguridad
(migración 100).
