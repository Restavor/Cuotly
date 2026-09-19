# Lo que queda por decidir del diseño definitivo móvil

**Escrito el 19/09/2026.** Acompaña a `docs/diseno/MAPA-DEL-DISENO-MOVIL.md`, que es la lectura
de las 157 páginas de `Cuotly_movil.pdf`. Aquel dice **qué** falta por decidir; este dice **qué
cuesta cada salida** y propone una, para que decidir sea elegir y no investigar.

Tres de las siete diferencias del mapa se cerraron el mismo día como **decisión 47** (alérgenos,
el plato como línea de texto, la barra única de móvil). Lo que sigue es el resto, uno por punto.

**Ninguna se resuelve por cuenta propia** (`CLAUDE.md`). Donde el diseño enseña un número o un
umbral que no existe, aquí NO se inventa: se dice que hace falta el número.

---

## Antes de empezar: tres que no eran lo que parecían

Al comprobarlos contra el código, tres de los diez puntos del mapa no son lo que la lectura del
PDF hacía pensar. Se dicen primero para no gastar decisiones en ellos.

### El estado "Configurando" **ya existe**

La página 54 enseña un historial de estados con "Configurando", y el mapa lo apuntó como algo que
no existe. Sí existe: `configuring` está en el `check` de `establishments.status` desde la
**migración 3**, tiene su fila en `establishment-status.ts` (servicio en marcha, consultable,
avisa) y su nombre en `naming.ts` y en `es.ts`. **No hay nada que decidir.** Lo único a verificar
al construir la pantalla es que el historial de estados lo nombre.

### Las notas internas **ya existen**, pero no cuelgan de Gestión

Migraciones **66** y **67** (notas internas y su auditoría), con `NotesPanel.tsx`. Hoy viven en la
pantalla de la conversación. El diseño (página 52) las pone como **subpestaña de Gestión**, con
editor con formato y vínculo a solicitud o trabajo. Eso no es una regla nueva: es dónde se pinta.
Va junto con el punto 9.

### Las copias de seguridad **ya existen**, pero tampoco

Migración **100** y `BackupsBlock.tsx`, dentro de la ficha. El diseño (página 58) las pone como
subpestaña de Gestión. Mismo caso: va con el punto 9.

---

## 1 · Crear el panel del restaurante como acto explícito

**Qué enseña el diseño** (páginas 27, 46, 53 y 56). La ficha del restaurante tiene un bloque
"Panel del restaurante · **No creado**" y un botón "Crear panel del restaurante". El formulario de
la 56 pide **propietario** (correo) y **envía invitación**, y dice literalmente: *"El panel
pertenece a este establecimiento. No crea un espacio de mantenimiento ni contrata la suscripción
de Cuotly del cliente."* La 53, al crear un establecimiento, avisa de que *"el panel del cliente
se crea después desde la ficha del restaurante"*. La 26 dice que aprobar una solicitud de acceso
**no** crea espacio ni panel.

**Qué hay hoy.** El panel no se crea: **existe en cuanto alguien tiene una fila en
`establishment_memberships`**. No hay estado "sin panel"; hay un restaurante con cero personas del
lado cliente, que es otra cosa dicha de otra manera.

**Qué cuesta.** Poco de datos y bastante de significado. Técnicamente basta una marca en
`establishments` (cuándo se creó el panel y quién lo creó) y que el alta de la primera persona del
cliente pase por una función que la ponga. Lo que cambia de verdad es que **el equipo ve un estado
que hoy no ve**: "este restaurante no tiene todavía a nadie del cliente dentro", que hoy hay que
deducir mirando la lista de usuarios.

**Propuesta.** Hacerlo, pero **derivado y no inventado**: "panel creado" = existe al menos una
persona del lado cliente, viva o invitada. Se guarda `panel_created_at` y `panel_created_by` en
`establishments` cuando se crea la primera, y el botón "Crear panel" es la pantalla de invitar a
esa primera persona — que es lo que el formulario de la 56 hace de todas formas. Así el diseño se
cumple sin un estado nuevo que se pueda quedar desincronizado de la realidad.

**Lo que hay que decidir:** si el panel es eso (derivado de la primera persona) o un acto aparte
que se pueda hacer **sin invitar a nadie**, dejando el panel creado y vacío.

---

## 2 · Permisos del cliente más finos

**Qué enseña el diseño** (páginas 49, 152 y 153). Dos roles —**Propietario** y **Editor**— y
**siete permisos con casilla**: crear solicitudes, editar menús, mensajes, subir archivos,
consultar informes, pagos y facturas, usuarios y accesos. La 49 los llama "Cliente principal" y
**"Editor de carta"**.

**Qué hay hoy.** Tres roles en `establishment_memberships` (`local_owner`, `editor`, `consulta`) y
**dos** permisos en `establishment_permissions`: `edit_establishment_data` y `view_billing`. El
resto de lo que el diseño quiere poner en casillas hoy sale del rol: `local_owner` y `editor`
escriben, `consulta` no.

**Qué cuesta.** Es el punto más caro de los diez y el que más se nota si se hace mal. Cinco
permisos nuevos son cinco columnas, cinco funciones de comprobación y **cinco sitios donde el
servidor tiene que decir que no** — porque ocultar la casilla no es un control (`CLAUDE.md`). Y
toca todo lo ya construido: solicitudes, menús, mensajes, archivos, informes y finanzas ya tienen
su puerta escrita contra el rol.

**Propuesta.** Hacerlo, porque el diseño lo pone en dos páginas y es lo que un restaurante con
varios empleados va a pedir, pero **en un hito propio y con esta regla**: los permisos **afinan
hacia abajo, nunca hacia arriba**. `local_owner` los tiene todos y no se le pueden quitar (si no,
un restaurante se queda sin nadie que gestione sus usuarios); `consulta` no gana ninguno por
casilla; el que se configura es **`editor`**. Eso deja la migración aditiva: cada permiso nuevo
nace en `false` y la puerta queda `rol = local_owner or (rol = editor and permiso)`, que es
exactamente la forma que ya tiene `client_can_view_billing()`.

**Lo que hay que decidir:** (a) si `consulta` desaparece o se queda —el diseño solo enseña dos
roles—, y (b) si los siete permisos son esos siete exactos o alguno sobra.

---

## 3 · Foto de perfil

**Qué enseña el diseño** (página 7, "Mi cuenta"). Un botón **"Cambiar foto"**. Y las páginas 3, 22
y 23 enseñan fotos de restaurante y avatares de persona en las listas.

**Qué hay hoy.** No hay foto de persona, y **está fuera a propósito con el motivo escrito** en la
migración 98: `files` es por espacio, y una foto de persona no es de ningún espacio — la misma
persona puede estar en dos espacios y su cara no pertenece a ninguno de los dos.

**Qué cuesta.** Un bucket aparte (o un prefijo por usuario dentro del que hay), con sus políticas
de Storage: cada quien escribe la suya y la lee quien comparta espacio. Y **choca con una regla
dura**: el cliente nunca ve la identidad individual de nadie del equipo de mantenimiento. Una foto
es identidad. Así que la foto del equipo **no puede llegar al cliente**, y las listas del diseño
que enseñan avatares del equipo son del lado del equipo.

**Propuesta.** Hacerlo solo para **personas del lado cliente y para uno mismo**: cada quien ve y
cambia la suya, el equipo ve las de sus compañeros, y el cliente **no ve ninguna del equipo**
(sigue viendo "Equipo de mantenimiento"). La foto de restaurante es otra cosa y esa sí cabe en
`files`, que es del espacio.

**Lo que hay que decidir:** si merece la pena ahora o se queda para después de lo funcional. Es lo
más prescindible de los diez.

---

## 4 · "Cuotly Insights" como fuente de datos

**Qué enseña el diseño** (páginas 41 y 44). En Informes y datos aparece una fuente llamada
**"Cuotly Insights"** junto a GA4, Search Console, Clarity y PageSpeed.

**Qué hay hoy.** Las cuatro integraciones reales y nada más. `DATA_SECTIONS` tiene Analítica,
Búsqueda, Comportamiento y Rendimiento.

**Qué cuesta.** Depende enteramente de qué es, y el PDF no lo dice: no enseña ni una métrica suya.
Puede ser (a) un nombre para el **resumen que Cuotly ya calcula** a partir de las cuatro fuentes,
que no cuesta nada porque ya existe; o (b) una **fuente propia** —telemetría de Cuotly sobre el
sitio del restaurante—, que es un producto entero: recogida, almacenamiento, retención y aviso
legal.

**Propuesta.** Entenderlo como (a): **Cuotly Insights es el nombre del resumen propio**, no una
fuente nueva. Es lo único que el PDF sostiene, y (b) sería inventarse un producto a partir de una
etiqueta en una pantalla, que es justo lo que `CLAUDE.md` prohíbe.

**Lo que hay que decidir:** si (a) es lo que querías decir. Si era (b), no se construye ahora: se
escribe qué mide, y eso es una conversación aparte.

---

## 5 · Almacenamiento por restaurante

**Qué enseña el diseño** (página 50). En los archivos del restaurante: **"Almacenamiento
(Magariños) 6,4 GB"**.

**Qué hay hoy.** El almacenamiento es **del espacio** (RN-SUB-13, migración 95): se avisa al 80 % y
al 100 %, al 100 % también a Cuotly, no se bloquea nada, y pasarse **se presupuesta aparte** — no
hay precio por GB y no se inventa (decisión 38).

**Qué cuesta.** Poco: es una suma con `where establishment_id = …` sobre `files`. No cambia el
límite ni la facturación, que siguen siendo del espacio.

**Propuesta.** Hacerlo como **dato informativo**: cuánto ocupa este restaurante, dentro del total
del espacio, dicho así para que nadie lo lea como una cuota propia. El límite sigue siendo uno, el
del espacio.

**Lo que hay que decidir:** nada, salvo que quieras que sea una **cuota por restaurante** de
verdad — y entonces hace falta el número, que no existe.

---

## 6 · Frecuencia de aviso y horario de recepción

**Qué enseña el diseño** (página 109). En ajustes de notificaciones: **"Instantáneo / Resumen
diario"** y un **horario de recepción**.

**Qué hay hoy.** Los avisos salen cuando ocurre el hecho. Hay preferencias por canal (push,
correo) pero no de **cuándo**.

**Qué cuesta.** El "Instantáneo" ya está. El "Resumen diario" es un trabajo en cola que junta lo
del día y lo manda a una hora — y con él vienen preguntas que el diseño no responde: **a qué hora**
sale el resumen, qué pasa con lo urgente (¿un impago espera al resumen?), y en qué zona horaria
—la del espacio, que es como se calcula todo lo demás (`CLAUDE.md`)—.

**Propuesta.** Partirlo: el **horario de recepción** ("no me avises entre las X y las Y") es
barato y no tiene trampa, y se puede hacer ya. El **resumen diario** necesita dos números que no
existen (hora del resumen, y qué se salta el resumen por urgente) y hasta tenerlos **no se
construye**.

**Lo que hay que decidir:** si el resumen diario entra, y con qué hora por defecto.

---

## 7 · Prioridad con motivo obligatorio

**Qué enseña el diseño** (página 63). Al clasificar una solicitud, el equipo elige prioridad y el
formulario pide un **motivo obligatorio**.

**Qué hay hoy.** La prioridad tiene dos caras y conviene no mezclarlas: el **cliente** ordena sus
solicitudes (es una ordenación suya, no un compromiso de Cuotly), y la **prioridad contractual**
la concede el plan (`plans.grants_priority`, y hoy solo Premium+ la da — decisión 39). El equipo no
tiene hoy una prioridad propia con motivo.

**Qué cuesta.** Poco de datos, y **una confusión cara si se llama igual que las otras dos**. Un
restaurante que ve "prioridad alta" puesta por el equipo va a entender que su trabajo va antes, y
eso es un compromiso que solo da el plan.

**Propuesta.** Hacerlo, con **nombre distinto y solo para el equipo**: no es "prioridad", es el
**orden de trabajo interno** con su motivo, no visible para el cliente (P7: el cliente no ve la
organización interna). El motivo obligatorio es lo bueno de la idea: obliga a escribir por qué algo
se adelanta, y eso queda en la auditoría.

**Lo que hay que decidir:** si vale con que sea interno, o si querías que el cliente lo vea —y
entonces hay que decir cómo convive con lo que concede el plan.

---

## 8 · Seis canales de fábrica

**Qué enseña el diseño** (página 74). Seis canales.

**Qué hay hoy.** Cuatro, que siembra `seed_default_channels()` de la migración 100: **General,
Proyectos web, Menú diario, Redes sociales**.

**Qué cuesta.** Nada: es una lista en una función, y sembrar dos más es una migración de tres
líneas. Los canales se pueden crear a mano de todas formas.

**Propuesta.** Ninguna por mi parte, porque **no sé cuáles son los dos que faltan** y adivinarlos
sería inventarlos. Necesito los dos nombres.

**Lo que hay que decidir:** los dos nombres. O que cuatro está bien y el diseño enseñaba un
ejemplo.

---

## 9 · Qué subpestañas tiene Gestión

**Qué enseña el diseño, y se contradice a sí mismo.**

| | Página 27 | Página 58 |
|---|---|---|
| | Datos | Usuarios y accesos |
| | Plan y servicios | Configuración |
| | Pagos | Archivos |
| | Usuarios | Copias de seguridad |
| | Archivos | |
| | Integraciones | |
| | Notas internas | |

**Qué hay hoy** (`MANAGEMENT_BLOCKS`): Datos (`ficha`) · Plan · Pagos · Usuarios · Archivos ·
Integraciones · **Estado del servicio**.

**Qué cuesta.** Es disposición, no reglas: mover bloques de sitio. Lo único con coste es que las
pestañas viajan en la dirección (`?vista=gestion&bloque=archivos`), así que **cambiar un `slug`
rompe los enlaces que alguien haya guardado**.

**Propuesta.** Que la **27 sea la buena** —es la página que enumera Gestión entera, la 58 solo
enseña una— y que la lista quede en **nueve**: los siete de hoy, más **Notas internas** y **Copias
de seguridad**, que ya existen y hoy están en otro sitio. "Configuración" de la 58 no se añade: es
el nombre que la 58 le da a lo que la 27 llama Datos.

**Lo que hay que decidir:** si la 27 manda, y si "Estado del servicio" se queda (el diseño no lo
enseña, pero es donde se archiva y reactiva un restaurante, y eso tiene que vivir en algún sitio).

---

## 10 · Atributos de plan "Prioridad" e "Informes"

**Qué enseña el diseño** (páginas 96 y 97). Las fichas de plan traen **"Prioridad: Alta /
Superior"** e **"Informes: Estándar / Avanzado"**.

**Qué hay hoy.** `plans` tiene `grants_priority` (sí/no) y nada sobre informes. Los planes y sus
precios los fijó la **decisión 39** con las fichas de Restavor del 16/09, y ahí solo Premium+
concede prioridad.

**Qué cuesta.** Dos columnas, poco. Lo caro es lo que no se ve: **"Superior" frente a "Alta" tiene
que significar algo** —un plazo, un orden— y **"Avanzado" frente a "Estándar" también**, o son dos
adjetivos en una tarjeta de precio, que es exactamente lo que `CLAUDE.md` llama dato de relleno.

**Propuesta.** No construirlo hasta saber qué significan. Si "Superior" es "va antes que Alta en la
cola", eso sí se puede escribir. Si "Avanzado" es "el informe mensual lleva las oportunidades y el
Estándar no", también. Sin eso, no.

**Lo que hay que decidir:** qué significan los cuatro adjetivos. Si no lo tienes decidido, lo
honesto es dejar los planes como están (decisión 39) y no pintar el atributo.

---

## Lo que propongo hacer, y en qué orden

Por dependencia y por riesgo, no por tamaño:

1. **Gestión** (punto 9) — es disposición, no toca reglas, y deja la ficha como el diseño la pinta.
2. **Almacenamiento por restaurante** (5) — una suma, sin decisiones abiertas.
3. **Canales** (8) — tres líneas, en cuanto haya dos nombres.
4. **Crear panel del restaurante** (1) — cierra el hueco de "quién está dentro por el cliente".
5. **Orden de trabajo interno con motivo** (7) — pequeño y deja rastro en la auditoría.
6. **Horario de recepción** (6, la mitad barata).
7. **Permisos finos del cliente** (2) — hito propio, es el que toca todo lo demás.
8. **Foto de perfil** (3) — lo último de lo que se hace.

**No se construye** hasta que haya números o significados: el resumen diario (6), los atributos de
plan (10), y "Cuotly Insights" si resulta ser una fuente de verdad (4).
