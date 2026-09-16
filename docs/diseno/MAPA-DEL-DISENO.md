# Mapa del diseño definitivo

Levantado el 16/09/2026 leyendo entera `docs/diseno/Cuotly_definitivo_diseno.pdf`
(157 vistas, 29,9 MB), que Bosco subió ese día y declaró **la única referencia
válida**: manda sobre los 26 PDF por sección de `Cuotly_PDFs_por_Seccion/`, que
quedan como material anterior.

Es el paso 2 del orden acordado (decisión 37): "el diseño definitivo en ordenador
si no queda ningún hito; si falta alguno lo hacemos ahora". Este documento es la
primera mitad de ese paso: **qué pide el diseño y qué de eso no existe todavía**.

## Cómo está organizado el PDF

Cada página es una vista maquetada con un código en la cabecera. Las vistas son
imágenes, no texto: el detalle se lee mirando la página, y aquí se cita por número.

| Familia | Vistas | Qué es |
|---|---|---|
| G | 8 | Contexto global, fuera de cualquier espacio |
| F y A | 20 | Acceso, estados de error y estados vacíos |
| M | 84 | Espacio de mantenimiento (el equipo) |
| R | 44 | Panel del restaurante (el cliente) |

Las maquetas llevan escrito "Datos de ejemplo" en casi todas las pantallas. Los
números, nombres y textos de relleno **no se copian**: CLAUDE.md lo prohíbe y el
propio diseño lo avisa.

## Lo que ya existe y solo cambia de forma

La mayor parte del diseño es la aplicación que ya está construida, reorganizada.
Existen hoy, con su lógica de servidor completa: solicitudes y su validación
interna, trabajos con evidencias y publicación, tareas, Menú Diario con plantillas
y cupo, mensajes, calendario, finanzas del espacio, presupuestos, informes,
oportunidades, equipo con supervisión y sustituto, planes y servicios con
versiones, integraciones analíticas con sus seis secciones de datos, ajustes,
auditoría, panel de plataforma, soporte y estado.

Lo que cambia es **cómo se llega a ello**. El diseño reorganiza la navegación:

- La ficha del restaurante pasa a tener cinco pestañas (Resumen, Operación,
  Informes y datos, Gestión, Historial) con subpestañas dentro de cada una. Hoy
  son rutas sueltas bajo `restaurantes/[id]`.
- El panel del restaurante se presenta como un contexto propio ("Panel de
  restaurante"), con su selector de restaurante y un "Volver al inicio de
  Cuotly". Hoy el cliente entra por la ruta del espacio.

## Lo que no existe todavía

Esto es lo que el diseño pide y la aplicación no tiene. Agrupado por bloques.

### 1. El contexto global (vistas G01 a G08)

El diseño abre con una zona **fuera de todo espacio**, con barra lateral propia:
Inicio, Mis solicitudes, Mensajes, Mi cuenta, Ayuda.

- **G01 Inicio**: "Necesita tu atención" con las tareas pendientes de todos los
  contextos a la vez, mis espacios, mis paneles de restaurante, mensajes sin leer
  y mis solicitudes. Hoy la raíz es un selector de contexto y nada más.
- **G04 Mis solicitudes**: las solicitudes de creación de espacio con su estado y
  la acción que toca (continuar el borrador, aportar información, ver
  instrucciones). Hoy no hay ruta global.
- **G07 y G08 Mensajes**: bandeja **global** con pestañas Mantenimiento y
  Restaurantes, selector de espacio o panel y filtro de no leídos. Hoy los
  mensajes viven dentro de cada espacio.
- **G05 Mi cuenta**: perfil con foto, nombre, apellidos, teléfono, idioma y zona
  horaria, más seguridad y preferencias de notificación, todo en una pantalla con
  pestañas. Hoy hay seguridad, sesiones, verificación y cierre, pero no perfil ni
  preferencias globales.
- **G06 Ayuda**: centro de ayuda global con buscador, categorías, preguntas
  frecuentes y contacto con soporte. Hoy la ayuda cuelga del espacio.

### 2. La solicitud de acceso a Cuotly (F01, A01 a A04, A09 a A12)

Un flujo nuevo y distinto de la solicitud de creación de espacio que ya existe.
Se pide acceso a Cuotly con nombre y apellidos, nombre del restaurante o empresa,
teléfono, correo y comentarios. Cuotly la revisa y la deja en enviada, necesita
más información (con mensaje del equipo y respuesta del solicitante), aprobada o
no aprobada con motivo. La vista A03 dice expresamente que aprobarla **no crea
espacio ni panel**. No existe nada de esto: ni tabla, ni pantallas, ni panel de
revisión.

### 3. Piezas sueltas que el diseño da por hechas

- **Grupos de restaurantes** (M82): pestaña propia con el grupo, su propietario y
  los establecimientos vinculados. Los grupos existen en la base de datos; la
  pantalla no.
- **Restaurantes archivados y transferencia entre espacios** (M84): reactivar y
  mover un establecimiento a otro espacio de mantenimiento, con el aviso de que
  solo puede estar activo en uno.
- **Copias de seguridad del contenido del restaurante** (M83): historial de
  respaldos, descarga y revisión de restauración, con sus limitaciones escritas.
- **Canales de mensajería interna** (M76): General, Proyectos web, Menú diario,
  Redes sociales y los que el equipo cree, con miembros por canal.
- **Vista de tablero** en Trabajos (M09), junto a la de lista.
- **Impuestos del espacio** (M58): datos fiscales, IVA por defecto, moneda,
  métodos de pago permitidos.
- **Cancelar una solicitud** por el restaurante mientras no esté completada (R12),
  y el estado "Cancelada" en los filtros (A14).
- **Copiar un borrador de solicitud a otro restaurante del grupo** (R07).
- **Copiar el menú anterior** (R13) y **alérgenos** en el editor del menú (R14).
- **Edición simultánea del menú** (A17): aviso de que otra persona guardó una
  versión mientras editabas, con comparación de las dos.
- **Comparar versiones del menú** con los cambios detectados (R18).
- **Solicitar la baja del servicio** por el restaurante (R24) y **registrar una
  solicitud de cancelación** desde la ficha (M47).
- **Pagos parciales** de un presupuesto con su historial (M51).
- **Recordatorios de cobro** con primer, segundo y tercer aviso (M52).

## Lo que hay que decidir antes de construir

### Facturas: el diseño contradice una regla vigente

La vista **R27** enseña una factura emitida por Cuotly, con número `FAC-2026-010`,
emisor y cliente con CIF, base, IVA y botón de descarga. **M42** dice que "las
facturas y recibos se generan automáticamente tras la confirmación del pago", y
**M58** configura "la información fiscal que se incluirá en tus facturas".

El PRD dice lo contrario en RN-FIN-09: Cuotly **no emite facturas**, solo permite
adjuntar la factura emitida fuera para descargarla, y la numeración fiscal está en
el bloque legal pendiente. La decisión 38, de este mismo mes, lo confirmó: las
facturas las preparará un agente aparte.

CLAUDE.md manda parar y preguntar ante una contradicción así, en vez de
resolverla por cuenta propia. **Está preguntado y pendiente de respuesta.**

### Detalles menores de las maquetas que no se copian

- Los planes que aparecen en algunas tablas ("Estándar", "Profesional", "Plan
  Esencial") no son los de Restavor. Los vigentes son Básico, Impulso, Impulso+,
  Premium y Premium+ (decisión 39).
- Aparecen categorías de cambio que el PRD no tiene ("cambio menor") y estados de
  solicitud que tampoco ("En análisis").
- La subnavegación de Gestión cambia entre maquetas: M40 a M46 la dividen en
  siete pestañas y M83 en cuatro distintas.
- M03 rotula el consumo del plan como "Restaurantes pequeños/medianos/grandes"
  donde M06 dice, bien, "Cambios".

Nada de esto se implementa tal cual: manda el PRD.
