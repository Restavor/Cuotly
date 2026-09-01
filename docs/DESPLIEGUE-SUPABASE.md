# Estado del despliegue en Supabase

Este archivo dice **qué migraciones del repositorio están aplicadas en el
proyecto real de Supabase** (`Cuotly`, `mcajbfxhkxtdhjoyrqha`, eu-west-1).
Existe porque el repositorio y el proyecto pueden ir desacompasados, y
adivinarlo mirando el esquema es justo la clase de suposición que ha
costado caro en este proyecto.

Actualizado el 01/09/2026.

## Aplicadas

Las migraciones **01 a 26** del repositorio están aplicadas.

Las 01–24 se aplicaron el 30/08/2026. Las 25 y 26 (todo el Hito 7:
mensajes, archivos y finanzas, más sus arreglos de revisión) se aplicaron
el 01/09/2026 — la 25 en seis partes, porque el archivo son 111 KB y no
cabe en una sola llamada.

Nombres en el proyecto: la 25 aparece como
`hito7_mensajes_archivos_finanzas_p01` … `_p06` y la 26 como
`hito7_review_fixes`. La numeración del proyecto no coincide con la del
repositorio porque el proyecto sella cada migración con la hora a la que se
aplicó; lo que manda es el orden, y el orden es el mismo.

## Pendientes

Las **27 a 42**. En orden, y sin saltarse ninguna:

| # | Archivo | Qué trae |
|---|---|---|
| 27 | `fix_updatable_client_views` | Cierra `client_jobs`, que era escribible |
| 28 | `hito7_review_fixes_2` | Segunda tanda de arreglos del Hito 7 |
| 29 | `corrections_identity` | Fuga de identidad en `corrections` (estaba viva) |
| 30 | `review4_fixes` | Cuarta revisión |
| 31 | `payment_methods` | Transferencia o Bizum (decisión 10) |
| 32 | `review5_fixes` | Quinta revisión |
| 33 | `service_stops_at_24h` | El servicio se detiene a las 24 h (decisión 11) |
| 34 | `review6_fixes` | Sexta revisión |
| 35 | `hito8_inicio_busqueda_notificaciones` | Avisos y búsqueda |
| 36 | `hito8_ausencias_busqueda_calendario` | Ausencias y calendario |
| 37 | `fase1_review_fixes` | Primera pasada de la revisión de cierre |
| 38 | `fase1_review_fixes_2` | Segunda pasada |
| 39 | `fase1_review_fixes_3` | Tercera pasada |
| 40 | `plan_change` | §6.4, el cambio de plan |
| 41 | `queue_and_sweeps` | La cola periódica y los barridos |
| 42 | `hu05_sessions` | HU-05, ver y cerrar sesiones |

**Ojo con la 29**: corrige una fuga de identidad del equipo hacia el
cliente que está **viva** en el esquema desplegado desde la migración 23.
No es un arreglo preventivo.

Los archivos grandes (25, 32, 33, 37, 38, 40 y 41) hay que trocearlos por
sentencias completas antes de aplicarlos. El troceo tiene que respetar los
cuerpos entre `$$`: partir una función por la mitad no da un error de
sintaxis inmediato, da una función a medias.

## Cómo comprobar que una tanda entró bien

El proyecto no tiene todavía ningún dato de negocio (cero espacios, cero
restaurantes, cero solicitudes), así que aplicar migraciones es de bajo
riesgo. Después de cada tanda conviene comprobar que el esquema del
proyecto y el de una base reconstruida desde cero con las mismas
migraciones coinciden en número de tablas y de funciones.
