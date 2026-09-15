# Estado del despliegue en Supabase

Este archivo dice **qué migraciones del repositorio están aplicadas en el
proyecto real de Supabase** (`Cuotly`, `mcajbfxhkxtdhjoyrqha`, eu-west-1).
Existe porque el repositorio y el proyecto pueden ir desacompasados, y
adivinarlo mirando el esquema es justo la clase de suposición que ha
costado caro en este proyecto.

Actualizado el 15/09/2026.

## Pendiente de aplicar

**La 93** (`soporte_centro_de_ayuda_y_estado`, Fase 4 · Hito 21), escrita el 15/09/2026 y sin
aplicar, a la espera de que Bosco lo ordene. Son 80 KB: irá en cinco o seis partes. **No es solo
aditiva**, y conviene saberlo antes: redefine `has_capability_as()` con una rama más, reescribe los
tres CHECK de `notifications` (tipos de evento, tipos de entidad y la raíz de los enlaces, que pasa a
admitir `/administracion/`), redefine `audit_entity_is_visible()`, `platform_panel_summary()` y
`platform_audit()`, y abre `platform_status_snapshot()` a `anon` a propósito. Nada de lo desplegado
hoy la lee, así que aplicarla antes que el código no rompe ninguna pantalla. Las otras 92 están
aplicadas.

## Aplicadas

**Las 92 migraciones del repositorio están aplicadas.** Las tres
de la 49 a la 51 se aplicaron el 04/09/2026 —el
apartado "La 49" de más abajo cuenta lo que se comprobó antes y después de
la que no era solo aditiva, y cómo se deshace si hiciera falta—, las 52 a
54 el 08/09/2026, la 55 el 09/09/2026, las 56 a 63 el 10/09/2026, las 64 a 70
el 11/09/2026, las 71 a 76 el 12/09/2026, las 77 a 80 el 13/09/2026 y la
81, la 82, la 83, la 84, la 85 y la 86 el 14/09/2026, y la 87, la 88, la 89 y
la 90 el 15/09/2026, y la 91 y la 92 ese mismo día, por orden de Bosco.

- La **91** (`panel_modo_soporte_y_2fa`, Fase 4 · Hito 19) el 15/09/2026,
  desde el MCP, en **cuatro partes** porque el archivo son 55 KB: `p1`
  (la 2FA, el tercer permiso fino y nombrar Administradores de Cuotly),
  `p2` (la sesión de Modo soporte y la puerta), `p3` (los dos
  disparadores, el aviso obligatorio y las familias de auditoría) y `p4`
  (las nueve funciones del panel). **NO es solo aditiva, y por eso se
  dice:** redefine `is_platform_owner()` —desde ese momento exige el
  reclamo `aal2` del token—, `is_space_member()` y `has_capability_as()`,
  que son las dos funciones por las que pasan todas las políticas; y quita
  la política `platform_roles_write` de la Fase 1. Una tabla nueva
  (`support_sessions`), una columna en `platform_roles` (`can_support`) y
  otra en `audit_log` (`support_session_id`), los dos CHECK de
  `notifications` ensanchados, 77 disparadores de solo lectura en soporte
  (las 83 tablas con `space_id` menos las seis exentas), el sello en
  `audit_log` y 23 funciones. Ninguna fila tocada.

  Comprobado en vivo justo después, con una consulta que se planta en
  cualquiera de los puntos: las 27 funciones existen; las cuatro internas
  (`support_access_level`, `has_capability_as`, `guard_support_read_only`,
  `stamp_support_session`) sin EXECUTE para `authenticated`; las públicas
  con EXECUTE para `authenticated` y no para `anon`; los 77 disparadores;
  el sello; `platform_roles` solo con `platform_roles_select`;
  `support_sessions` con RLS y su política; el aviso
  `support_session_started` en el CHECK y obligatorio; la familia
  `support` en `manage_space`. Y **la cerradura, con la identidad de Bosco
  emulada en la sesión SQL**: con `aal1`, `is_platform_owner()` es falso y
  `my_platform_access()` dice `is_owner: true, two_factor: false`; con
  `aal2`, es verdadero y `platform_panel_summary()` responde. Después se
  regeneró `database.types.ts` (91 migraciones) y
  `src/services/platform-gateway.ts` dejó la frontera con `any`.

  **Lo que el analizador dice y por qué se acepta.** Las 18 funciones
  nuevas abiertas a `authenticated` aparecen en
  `authenticated_security_definer_function_executable`, como todas las
  públicas del proyecto: cada una comprueba permiso por dentro, y la
  suite 42 lo demuestra desde los dos lados. Ninguna aparece en la de
  `anon`. `session_is_two_factor()` sale en `function_search_path_mutable`:
  no es `SECURITY DEFINER` y solo lee un ajuste de sesión, así que no hay
  nada que un `search_path` pudiera desviar; se fijará en la siguiente
  migración por limpieza, no por riesgo. Un dato que **no** es de la 91 y
  que conviene saber: `is_platform_owner` e `is_space_member` tienen
  EXECUTE para `anon` desde la Fase 1 (igual en local). No cambia nada
  —las dos devuelven falso sin `auth.uid()`— y se cierra cuando se toque
  esa capa.

  **Lo que cambia para Bosco desde este momento:** la administración de
  Cuotly no responde hasta que registre el segundo factor en
  `/cuenta/seguridad` (Authentication → Multi-Factor con TOTP habilitado en
  el proyecto). En Restavor entra con normalidad.

- La **77** (`menu_diario_menus_versiones_y_actualizaciones`, Fase 2 ·
  Hito 9) el 13/09/2026, desde el MCP, en **cuatro partes** porque el
  archivo son 80 KB: `p1` (servicio, plantillas y ciclo de
  actualizaciones), `p2` (menús, versiones, publicaciones, historial,
  corte de las 21:00 y helpers internos), `p3` (crear, versionar, copiar,
  preparar y pedir la publicación) y `p4` (el equipo, cancelar y devolver,
  auditoría). Solo aditiva: siete tablas nuevas, dos columnas en
  `services` (`kind`, `included_updates`), los dos CHECK de
  `notifications` ensanchados y `create_restavor_space()`,
  `audit_action_capability()` y `audit_entity_is_visible()` redefinidas.

  Comprobado en vivo justo después, con una consulta que se planta en
  cualquiera de los cinco puntos: ninguna de las once internas tiene
  EXECUTE para `anon` ni `authenticated`; las veinte públicas lo tienen
  para `authenticated` y no para `anon`; las seis columnas de actor
  (`menus.created_by`, `menu_versions.created_by`,
  `menu_events.actor_id`, `menu_templates.created_by` y `archived_by`,
  `menu_update_entries.created_by`) están revocadas; las siete tablas
  tienen RLS activado y política; y los dos servicios "Menú Diario" del
  proyecto (el de Restavor y el del espacio de demostración) quedaron
  como `daily_menu` con 30 actualizaciones. `menu_publications` conserva
  el privilegio de tabla a propósito: al cliente lo deja fuera la
  política, que es como manda CLAUDE.md tapar una fila entera.
- La **78** (`menu_diario_plantillas_y_descargas`, Fase 2 · Hito 10) el
  13/09/2026, desde el MCP, en una sola llamada (12 KB). Solo aditiva:
  ocho columnas de diseño en `menu_templates` (con su `grant select`,
  porque el privilegio de columna de esa tabla se enumeró entero en la
  77), `update_menu_template_design()`, la tabla `menu_downloads` y
  `register_menu_download()`. Comprobado en vivo: las dos funciones con
  EXECUTE para `authenticated` y no para `anon`, `downloaded_by`
  revocada, el diseño legible por el restaurante, RLS y política en
  `menu_downloads`. Después de aplicarla se regeneró
  `database.types.ts` desde el proyecto (78 migraciones), que es lo que
  permite que las pantallas del Hito 10 llamen a las funciones nuevas
  con tipos.
- La **79** (`menu_diario_equipo_cola_y_correccion`, Fase 2 · Hito 11)
  el 13/09/2026, desde el MCP, en dos partes (`p1_candidatos_cola_
  correccion` y `p2_avisos_barrido_busqueda`), con `database.types.ts`
  regenerado después. Esta nota se escribe a posteriori: el commit que
  la aplicó (`4063a10`) no actualizó este archivo, y durante unas horas
  aquí ponía "78 aplicadas" con la 79 ya en el proyecto. Lo que se
  comprobó al aplicarla está en ese commit; lo que se comprobó DESPUÉS,
  al escribir esto, es lo mismo que para la 80, abajo.
- La **80** (`calendario_completo_y_presupuestos`, Fase 2 · Hito 12) el
  13/09/2026, desde el MCP, en cuatro partes (`p1_mensualidad_del_
  servicio`, `p2_calendario_quotes_y_avisos`, `p3_crear_enviar_aceptar_
  rechazar` y `p4_inicio_cliente_plantillas_auditoria`), aplicadas
  DESPUÉS del commit de la decisión 21 (`63ecfc7`), así que llevan
  `accept_quote(uuid, text)` con el motivo y `decided_by_team`. **No es
  solo aditiva**: borra y recrea `space_calendar()` (cambia de firma:
  tres parámetros más) y `create_menu_template()` (un parámetro más,
  el presupuesto), y `upcoming_renewals()` con la misma firma. Las
  pantallas del repositorio ya llaman a las firmas nuevas; una
  compilación anterior de la web contra este proyecto fallaría en el
  calendario y al crear plantillas hasta desplegarse.

  Comprobado en vivo, con una consulta que solo devuelve problemas y
  devolvió ninguno: las cinco internas
  (`next_request_code_internal`, `notify_quote_event`,
  `run_monthly_charges`, `service_monthly_price_internal`,
  `subscription_current_period`) sin EXECUTE para `anon` ni
  `authenticated`; las diecisiete públicas de la migración con EXECUTE
  para `authenticated` y no para `anon`; las firmas antiguas de
  `space_calendar(uuid, date, date)` y `create_menu_template(uuid, text,
  text)` ya no existen; `quotes` con RLS activado, política, `space_id
  NOT NULL`, el SELECT de tabla revocado (privilegio de columna) y
  `decided_by` no legible por `authenticated` (P7). 118 migraciones
  registradas en el proyecto.
- La **81** (`integraciones_conexiones_y_sincronizacion`, Fase 3 · Hito
  13) el 14/09/2026, desde el MCP, en tres partes (`p1_cuentas_y_tablas`,
  `p2_permisos_avisos_y_personas` y
  `p3_credencial_cola_archivar_auditoria`), por orden de Bosco: estuvo un
  día en el repositorio sin aplicar a propósito, porque el PRD §27 en el
  que se apoya era un borrador. **Solo aditiva**: cuatro tablas
  (`integrations`, `integration_credentials`, `sync_runs`,
  `metric_points`), veinte funciones, un disparador sobre
  `establishments` (archivar desconecta), los dos eventos y el tipo de
  entidad `integration` en los CHECK de `notifications`, y
  `audit_action_capability()` recreada con la familia `integration`. No
  toca ninguna fila.

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las 81 migraciones aplican desde cero
  sobre PostgreSQL 16 y pasan la suite de la 81, el barrido del Hito 7 y
  la de auditoría. Y contra el proyecto, antes de tocarlo: 118
  migraciones, ninguno de los objetos de la 81, las cinco funciones de
  las que depende presentes y los dos CHECK de `notifications` con el
  nombre que la migración borra.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve
  problemas y devolvió ninguno: las diez internas
  (`integration_client_owner_as`, `assert_can_manage_integrations`,
  `notify_integration_event`, `disconnect_integration_internal`,
  `store_integration_credential`, `read_integration_credential`,
  `claim_integration_runs`, `finish_integration_run`,
  `mark_integration_revocation_done`, `revoke_integrations_on_archive`)
  sin EXECUTE para `anon` ni `authenticated`; las diez públicas con
  EXECUTE para `authenticated` y no para `anon`; las cuatro tablas con
  RLS, política y `space_id NOT NULL`; el SELECT de tabla revocado en
  `integrations`, `integration_credentials` y `sync_runs`, y las seis
  columnas tapadas (`connected_by`, `disconnected_by`, `created_by`,
  `ciphertext`, `created_by`, `requested_by`) no legibles por
  `authenticated`; el disparador de archivado; los dos CHECK con los
  valores nuevos; `audit_action_capability('integration.connected')` =
  `manage_clients`; la espera entre reintentos 1 h, 4 h, 16 h, 24 h,
  24 h. 121 migraciones registradas en el proyecto.

  `database.types.ts` regenerado desde el proyecto después (81
  migraciones). Al regenerar salieron, además de lo de la 81, cuatro
  funciones internas de la 80 que el archivo escrito a mano no tenía
  (`next_request_code_internal`, `notify_quote_event`,
  `service_monthly_price_internal`, `subscription_current_period`) y
  tres claves ajenas a `quotes` en otro orden; nada de lo que las
  pantallas usan cambió de firma.

  Lo que añade al analizador de Supabase (`get_advisors`, seguridad):
  cuatro `WARN` de `search_path` mutable sobre las cuatro cuentas puras
  (`integration_auth_kind`, `integration_sync_frequency`,
  `integration_retry_delay`, `integration_data_is_stale`), de la misma
  familia que las de `job_load_points` (no tocan tablas; fijarles el
  `search_path` es higiene pendiente); y cinco `WARN` de "función
  SECURITY DEFINER ejecutable por `authenticated`" sobre las cinco
  públicas que comprueban el permiso por su cuenta
  (`begin_integration_connection`, `cancel_integration_connection`,
  `disconnect_integration`, `request_integration_check`,
  `establishment_integrations`), que es lo esperado. Ninguna de la 81
  aparece como ejecutable por `anon`. Ningún `ERROR` nuevo.

- La **82** (`integraciones_revocacion_remota`, Fase 3 · Hito 14) el
  14/09/2026, desde el MCP, de una sola pieza (6 KB, no hace falta
  trocearla), por orden de Bosco: el Hito 14 se cerró en el contenedor el
  mismo día y la aplicación al proyecto se dejó a su orden, como con la
  81. **Solo aditiva**: una columna en `integrations`
  (`external_revocation_attempts`, `integer not null default 0` con
  `CHECK >= 0`) y tres funciones reservadas a `service_role`
  (`pending_integration_revocations`, `read_revoked_integration_token`,
  `record_integration_revocation_attempt`) con las que el proceso de la
  cola revoca en Google el token de una integración desconectada
  (RN-INT-06) y anota el resultado, dos intentos como máximo (RN-INT-08).
  No toca ninguna fila: `integrations` tenía 0 filas.

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las 82 migraciones aplican desde cero
  sobre PostgreSQL 16 y pasan las 36 suites de `supabase/tests/` en el
  orden de CI, la suya (`integraciones_revocacion_remota.sql`) incluida.
  Y contra el proyecto, antes de tocarlo: 121 migraciones, ninguno de los
  objetos de la 82, y presentes las dependencias
  (`integrations.external_revocation_pending`,
  `integrations.disconnected_at`, `integration_credentials`,
  `read_integration_credential`, `mark_integration_revocation_done`).

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve
  problemas y devolvió ninguno: las tres funciones existen, son `SECURITY
  DEFINER`, sin EXECUTE para `anon` ni `authenticated` y con EXECUTE para
  `service_role`; la columna nueva es `NOT NULL` con su `default 0` y su
  `CHECK`, y no la lee `anon` ni `authenticated` (no entra en el `grant
  select` de la 81); `authenticated` sigue leyendo las columnas de la 81
  y sigue sin SELECT de tabla sobre `integrations`; 122 migraciones
  registradas y la última es la 82.

  `database.types.ts` regenerado desde el proyecto después (82
  migraciones). La diferencia con el anterior es exactamente lo de la
  82: la columna en `integrations` y las tres funciones. Ninguna firma
  que usen las pantallas cambia. El proceso de la cola deja de fallar en
  `pending_integration_revocations()` con "function does not exist".

- La **83** (`zona_horaria_del_espacio_para_el_restaurante`, Fase 3 ·
  Hito 14) el 14/09/2026, de una sola pieza (3 KB), por orden de Bosco.
  **Solo aditiva**: una función nueva, `establishment_timezone()`, que
  devuelve la zona horaria del espacio de un restaurante y nada más de
  `spaces`, guardada por `can_read_establishment()`. No crea tablas ni
  columnas, no toca ninguna fila y no cambia ninguna firma existente:
  ninguna pantalla deja de funcionar si se aplica antes de desplegar el
  código, ni al revés.

  Para qué: las cuatro pantallas del restaurante calculaban las fechas con
  `"Europe/Madrid"` escrito en el código, porque un restaurante no puede
  leer `spaces` (`spaces_select` exige ser miembro del espacio). Con un
  solo espacio, y ese en Madrid, la hora salía bien; con un espacio en otra
  zona, sus plazos aparecían corridos y nada fallaba. CLAUDE.md manda
  calcularlas en la zona del espacio.

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las 83 migraciones aplican desde cero
  sobre PostgreSQL 16 y pasan las 37 suites de `supabase/tests/` en el
  orden de CI, la suya (`zona_horaria_del_restaurante.sql`) y el barrido
  del Hito 7 incluidos. Tres mutaciones sobre la suya, las tres
  detectadas: devolver la zona por defecto de la columna en vez de la del
  espacio, quitar la comprobación de permisos y abrir la función a `anon`.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: la función existe con su firma, es `SECURITY
  DEFINER`, `STABLE` y con `search_path` fijado; sin EXECUTE para `anon`
  ni para `PUBLIC` y con EXECUTE para `authenticated` (la llaman las
  pantallas, así que revocársela la dejaría inservible en vez de cerrada);
  su cuerpo comprueba `can_read_establishment()`; tiene su comentario; y
  `spaces` sigue con RLS activado y la política `spaces_select ::
  is_space_member(id)`, que es lo que mantiene fuera al restaurante y la
  razón de que la función exista. 123 migraciones registradas.

  `database.types.ts` regenerado desde el proyecto después (83
  migraciones). La única diferencia con el archivo del repositorio era la
  cabecera: la entrada de `establishment_timezone` que se había escrito a
  mano coincide exactamente, colocación alfabética incluida.

  Lo que añade al analizador de Supabase (`get_advisors`, seguridad):
  nada. Ninguna de las tres funciones aparece como ejecutable por `anon`
  ni por `authenticated` (están cerradas a las dos), y todas fijan el
  `search_path`. Ningún `ERROR` nuevo.

- La **84** (`oportunidades_por_reglas_deterministas`, Fase 3 · Hito 15)
  el 14/09/2026, desde el MCP, en **tres partes** porque el archivo son
  56 KB: `p1_capacidad_catalogo_y_tablas` (la capacidad "Aprobar
  informes", el catálogo de las nueve reglas, qué deja ver cada plan, las
  tres tablas, las dos columnas de `requests` y el CHECK y la política de
  `state_events`), `p2_deteccion_y_estados` (la detección de §99 y las
  funciones de estado y de propuesta) y
  `p3_accion_del_cliente_y_auditoria` (§100 y la familia `opportunity`).

  **Casi toda aditiva, con dos excepciones que hay que tener presentes**:
  redefine `has_capability_as()` (una capacidad más, `approve_reports`) y
  **reescribe la política `state_events_select`**. Esa política se copió
  de la migración **30**, que es la vigente, y no de la 25 ni de la 26: la
  rama de `task` lleva `is_space_member(space_id)` ADEMÁS de
  `can_read_task()`, porque esa incluye al cliente a través de
  `can_read_job()`, y la 25 tenía una rama de `establishment` que la 26
  quitó a propósito. Las dos cosas se comprobaron después, una a una.

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las 84 migraciones aplican desde cero
  sobre PostgreSQL 16 y pasan las 38 suites de `supabase/tests/` en el
  orden de CI, la suya (`oportunidades.sql`) y el barrido de identidad del
  Hito 7 incluidos. Dos mutaciones sobre la suya, las dos detectadas:
  dejar que el restaurante vea una oportunidad "detectada" (RN-OPP-07) y
  quitar el índice único que hace cumplir §99.

  Comprobado en vivo DESPUÉS, con una consulta de catorce comprobaciones
  que solo devuelve problemas y devolvió ninguno: las dos internas
  (`upsert_detected_opportunity`, `establishments_for_opportunity_detection`)
  sin EXECUTE para `anon` ni `authenticated`; las quince públicas con
  EXECUTE para `authenticated` y no para `anon`; `has_capability_as()`
  sigue cerrada a las dos después de redefinirla; las tres tablas con RLS
  activado, política y `space_id NOT NULL`; las cinco columnas de
  identidad de `opportunities` revocadas y las que el restaurante sí debe
  leer, legibles; el índice único de §99 existe y es UNIQUE; las nueve
  reglas responden y una inventada no; los ocho estados dicen quién los ve
  y el trabajador no aprueba; las tres columnas nuevas están; el CHECK de
  `state_events` acepta `opportunity`, su política conserva
  `is_space_member` en la rama de tarea y NO ha vuelto la rama de
  `establishment`; y la familia `opportunity` de la auditoría es de
  `manage_clients`. 126 migraciones registradas.

  `database.types.ts` regenerado desde el proyecto después (84
  migraciones). Con los tipos ya en su sitio, el cargador y las acciones
  de las pantallas dejan de necesitar la frontera con `any` que llevaban
  mientras la migración estaba sin aplicar: `opportunities-load.ts` vuelve
  a `SupabaseClient<Database>` y `opportunity-actions.ts` llama por RPC
  con los nombres y los argumentos tipados. Al hacerlo aparecieron dos
  cosas que el `any` tapaba y que ahora están resueltas: los CHECK de la
  tabla son `text` para TypeScript, así que la fila se estrecha con
  guardas de tipo (una fila imposible se deja fuera y se registra, en vez
  de inventarle un impacto para poder pintarla), y un parámetro que no se
  quiere cambiar se **omite** en vez de mandarse nulo, que es lo que el
  `coalesce` de cada función lee como "déjalo como estaba".

  Lo que añade al analizador de Supabase (`get_advisors`, seguridad):
  ningún `ERROR` nuevo. Las ocho funciones que comprueban permisos por su
  cuenta entran en "Signed-In Users Can Execute SECURITY DEFINER
  Function", que es donde están ya casi todas las del proyecto y es el
  diseño. Las siete del catálogo de reglas entran en "Function Search Path
  Mutable", junto a once que ya estaban (las cuatro de `integration_*`,
  `audit_action_capability`, `job_load_points`,
  `menu_correction_window_ends_at`…): son `SECURITY INVOKER` puras —un
  `case` sobre su argumento, sin tablas y con la única llamada interna
  cualificada con `public.`—, así que no hay nada que secuestrar por
  `search_path`. Uniformarlas es un cambio de dieciocho funciones y una
  decisión aparte, no algo que colar en un despliegue.

- La **85** (`informes_generacion_aprobacion_y_envio`, Fase 3 · Hito 16)
  está escrita y **NO se ha aplicado todavía**: queda pendiente de que
  Bosco lo ordene, como todas. Lo que hay que saber antes de aplicarla:

  **Casi toda aditiva, con tres excepciones que hay que tener presentes.**
  Reescribe la política `state_events_select` para añadirle la rama de
  `report` —copiada de la **84**, que es la vigente, con la rama de `task`
  y su `is_space_member(space_id)` intactos y sin devolverle la rama de
  `establishment`—; rehace los dos CHECK de `notifications` (`event_type`
  con los dos avisos nuevos, `entity_type` con `report`); y redefine
  `audit_action_capability()` y `audit_entity_is_visible()` con una
  familia y una entidad más. Cuatro tablas nuevas, una columna nueva en
  `establishment_permissions` y ninguna columna retirada.

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las **85 migraciones aplican desde
  cero** sobre PostgreSQL 16 y pasan las **39 suites** de `supabase/tests/`
  en el orden de CI, la suya (`informes.sql`) y el barrido de identidad y
  de funciones internas del Hito 7 incluidos. **Ocho mutaciones sobre la
  suya, las ocho detectadas**: dejar que el restaurante vea un informe
  aprobado, cegar la cuenta de oportunidades pendientes, devolverle a
  `reports` el `select` entero, permitir cualquier transición a cualquiera
  y mandar el aviso de la fecha a todo el equipo, dejar a la cola fuera de
  la comprobación de oportunidades pendientes (ese fue un fallo real del
  propio hito, contado en el ROADMAP), encender las oportunidades por
  omisión y quitarle el criterio al resumen ejecutivo.

  **Al aplicarla, dos cosas seguidas.** Regenerar `database.types.ts`, y
  quitar la frontera con `any` de `src/lib/supabase/reports-client.ts` —un
  archivo de cuatro líneas, escrito para que la frontera esté en un solo
  sitio—, devolviendo `reports-load.ts` y `informes/actions.ts` al cliente
  tipado. En el Hito 15 ese mismo paso destapó dos fallos reales.

- Las 01–24 se aplicaron el 30/08/2026.
- Las 25 y 26 (Hito 7: mensajes, archivos y finanzas, más sus arreglos de
  revisión) el 01/09/2026 — la 25 en seis partes, porque el archivo son
  111 KB y no cabe en una sola llamada.
- Las **27–42** el 01/09/2026, en la misma sesión.
- La **43** (`client_request_job`) el 02/09/2026, desde el conector MCP: la
  destapó el recorrido de CA-19 en un teléfono. El restaurante no podía
  pedir su corrección gratuita porque la pantalla leía la tabla `jobs`,
  que el cliente no puede leer a propósito (P7 y CA-04); ahora se lo
  pregunta a una función que solo contesta el estado del trabajo y si le
  queda corrección, sin ninguna identidad.
- La **44** (`retry_request_analysis`) el 02/09/2026, también desde el MCP:
  le da al equipo con `manage_requests` el permiso para reintentar el
  análisis de una solicitud cuando el automático falló. Comprobada en vivo
  con las tres identidades sembradas: la trabajadora rechazada, la
  propietaria aceptada, y el camino automático del cliente intacto.
- La **45** (`storage_bucket_files`) el 03/09/2026, desde el MCP: crea el
  bucket privado `files`, que era lo único que faltaba para que la
  interfaz de archivos funcionara. Ver el apartado "El bucket de
  archivos" más abajo.

  Un detalle del que conviene acordarse: el archivo del repositorio
  termina comprobando que `storage.objects` tiene RLS activado en vez de
  activarlo. Activarlo desde una migración da `must be owner of table
  objects` —esa tabla es de Supabase, no del proyecto—, así que la
  migración se para con un mensaje claro si alguna vez apareciera
  desactivado.
- La **46** (`consumption_threshold_client_only`) el 03/09/2026: el aviso
  de consumo de bolsa (§18, 80 % y 100 %) pasa a emitirse **solo al
  restaurante**. Cambia a quién se avisa, nada más; los avisos ya emitidos
  al equipo no se tocan.
- La **47** (`task_assignment`) el 03/09/2026: `assign_task()` y
  `list_task_candidates()`, sin las cuales la mitad "y repartirlas" de
  HU-21 no funcionaba.
- La **48** (`hu07_service_subscriptions`) el 03/09/2026, en dos partes:
  contratar un servicio adicional (`create_service_subscription()`, con su
  permanencia de 3 meses de RN-COM-09), deshacer un cambio de plan
  programado (`cancel_scheduled_plan_change()`) y enseñar el prorrateo
  antes de cobrarlo (`plan_change_preview()`). Incluye el relleno que abre
  el ciclo de consumo de los planes que ya estaban de alta sin uno.

  Comprobadas en vivo con las identidades sembradas, con rollback: la
  trabajadora no contrata servicios ni ve el prorrateo; el propietario sí,
  y contratar dos veces devuelve la misma suscripción (CA-17); la
  permanencia del servicio sale a 3 meses; anular un cambio programado lo
  deja en `cancelled` en vez de borrarlo y libera el índice para programar
  otro, y anularlo dos veces devuelve `false` sin error.

- La **50** (`bandeja_de_conversaciones`) el 04/09/2026: `list_conversations()`
  para la bandeja de §66 y `list_conversation_messages()` recreada con
  `is_mine`, que es lo que arregla que el restaurante viera sus propios
  mensajes firmados como "Equipo de mantenimiento".
- La **51** (`borrador_de_solicitud`) el 04/09/2026, en dos llamadas: el
  cuerpo (columna `requests.source_conversation_id` con su `grant select`
  de columna, `update_request_draft()`, `attach_file_to_request_draft()` y
  `detach_file_from_request_draft()`) y, aparte, el `revoke` de
  `convert_conversation_to_request()` a `anon`.

  Ese `revoke` no estaba planeado: se descubrió comprobando privilegios en
  vivo después de aplicar el cuerpo. La función nació en el Hito 7 con el
  `EXECUTE` que Supabase concede por defecto a toda función nueva y nadie
  se lo quitó, así que una función que ESCRIBE llevaba abierta a `anon`
  desde entonces. No era explotable —comprueba `can_read_conversation()`, y
  sin sesión `auth.uid()` es null—, pero es exactamente lo que CLAUDE.md
  manda cerrar.

  Comprobado en vivo después de aplicarla: las tres funciones nuevas y la
  de conversión tienen `EXECUTE` para `authenticated` y no para `anon`, y
  la columna nueva la lee `authenticated` y no `anon`. Antes de aplicarla,
  las **51 migraciones aplican desde cero** sobre un PostgreSQL 16 local y
  **las doce suites de `supabase/tests/` pasan**, con cuatro mutaciones que
  confirman que la nueva no es un adorno.
- Las **71 a 73** (las tres decisiones del 12/09/2026) el 12/09/2026,
  desde el MCP, en tres llamadas y en orden. Antes de aplicarlas se midió
  lo que la 72 iba a tocar: **tres solicitudes en curso tenían puesto en
  la cola**, y `ai_usage` estaba vacío, así que el relleno de la 73 no
  tenía nada que rellenar.

  Comprobado en vivo después: `record_classification()` recreada sin
  `EXECUTE` para `anon` ni `authenticated` (el `revoke` final de la 73
  hizo su trabajo); `notify_reassignment_deciders()` y
  `request_is_rankable()` cerradas; `request_job_reassignment()` sigue
  abierta al equipo; los dos CHECK de `notifications` admiten los dos
  eventos nuevos y `task`; el CHECK `ai_usage_cost_units_agree` existe;
  **ninguna solicitud en curso conserva puesto** y ninguna cola tiene
  huecos ni repetidos. Los tres puestos soltados no se recuperan y no hace
  falta: se recalculan ordenando otra vez.
- La **74** (`el_cuarto_caso_de_rn_est_04`) el 12/09/2026, desde el MCP:
  `grant_group_future_establishments_access()` —una membresía de grupo
  con rol `editor`, el modelo que la 39 ya tenía— y
  `establishment_client_users()` corregida para que un editor de grupo
  salga sin facturación, igual que decide `client_can_view_billing()`.
  Solo funciones: no toca ninguna fila. Comprobado en vivo: la nueva tiene
  `EXECUTE` para `authenticated` y no para `anon`; no había ningún editor
  de grupo vivo (antes de la 74 no podía haberlo, porque nada escribía esa
  fila).
- La **75** (`condiciones_versionadas_y_aceptadas`) el 12/09/2026, desde
  el MCP, en dos partes —tablas y funciones— porque el archivo son 31 KB.
  Solo crea: `plan_versions`, `service_versions` y `terms_acceptances`
  con RLS y privilegios de columna, siete funciones, el tipo
  `subscription` en el CHECK de `file_links`, y dos familias en
  `audit_action_capability()`. No toca ninguna fila existente.

  Comprobado en vivo después: `assert_terms_version_current()` cerrada a
  `authenticated`; las de escribir cerradas a `anon` y abiertas al
  equipo; `published_by` y `recorded_by` tapadas al cliente y
  `conditions` legible; RLS activado en las tres tablas; `file_links`
  admite `subscription`; `plan.*` clasificada como `manage_space`.
- La **76** (`el_aviso_de_las_condiciones_nuevas`) el 12/09/2026, desde
  el MCP, en una sola llamada. Ensancha el CHECK de `notifications` con
  `terms_version_published`, crea `notify_terms_version_published()`
  (interna) y recrea las dos funciones de publicar condiciones para que
  la llamen al final. No toca ninguna fila: en el proyecto no había
  ninguna versión de condiciones publicada, así que ningún aviso se
  emite retroactivamente.

  Comprobado en vivo después: la interna sin `EXECUTE` para `anon` ni
  `authenticated`; las dos de publicar cerradas a `anon` y abiertas al
  equipo; el CHECK admite el evento; cero versiones y cero avisos.

- La **85** (`informes_generacion_aprobacion_y_envio`, Fase 3 · Hito 16) el
  14/09/2026, por orden de Bosco, **en cinco partes** (el archivo son 70 KB:
  p1 quién ve, el catálogo y `reports`; p2 el resto de las tablas con sus
  políticas y privilegios de columna, crear y editar; p3 los seis estados,
  programar, los destinatarios y el envío; p4 el aviso de las 24 h, la cola
  y los conjuntos de datos; p5 eventos, avisos y auditoría).

  **No es solo aditiva**, y por eso se dice: reescribe la política
  `state_events_select` entera —hay que copiar la vigente y añadirle la rama
  de `report`— y ensancha los dos CHECK de `notifications`. Cuatro tablas
  nuevas, veintitrés funciones y ninguna fila tocada.

  Lleva dentro los dos cambios de la **decisión 28**: el informe lo ven
  todos los del restaurante con el acceso vigente —el permiso fino
  `view_reports` y su función no llegaron a existir en el proyecto— y el
  correo va a los dos lados, sin ninguna dirección escrita en el código.

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las 85 migraciones aplican desde cero
  sobre PostgreSQL 16 y pasan las 39 suites en el orden de CI; y las cinco
  partes, por separado y en orden, sobre una base con las 84 anteriores.
  Dos mutaciones de la suya detectadas por el motivo correcto: quitar el
  lado de mantenimiento de los destinatarios deja el envío en 4 de 8, y
  quitar la comprobación de acceso retirado deja ver los informes a quien
  ya no está.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: las siete internas sin EXECUTE para `anon` ni
  `authenticated`; las dieciséis públicas con EXECUTE para `authenticated`
  y sin él para `anon`; las cuatro tablas con RLS, política y `space_id NOT
  NULL`; el SELECT de tabla revocado en `reports` y `report_versions` y las
  tres columnas de actor (`created_by`, `updated_by`, `approved_by`)
  tapadas al cliente; los dos avisos de informe dentro del CHECK de
  `notifications`; la familia `report` en `audit_action_capability()`; y
  que `view_reports` y `set_client_report_permission()` **no existen**.

  `database.types.ts` regenerado desde el proyecto (85 migraciones).

- La **86** (`informes_enviar_pasa_por_el_flujo`, Fase 3 · Hito 16) el
  14/09/2026, por orden de Bosco, de una sola pieza (9 KB). Arregla los dos
  agujeros que encontró la revisión del hito y que la 85 ya tenía dentro.

  **No es solo aditiva**: sustituye el cuerpo de `send_report()` y
  **reescribe la política `report_versions_select`**. No crea tablas ni
  columnas y no toca ninguna fila. Orden de despliegue: da igual, porque
  las dos cosas que cambia solo restan —un envío que antes salía ahora se
  rechaza, y unas versiones que antes se veían ahora no—, así que aplicarla
  antes del código no rompe ninguna pantalla.

  Qué cierra. Primero, `send_report()` nunca preguntaba a
  `report_transition_allowed()`: comprobaba quién llamaba y si ya estaba
  enviado, y escribía `status = 'sent'`. Un propietario que la llamara por
  RPC sobre un **borrador recién creado** lo enviaba, con el resumen
  ejecutivo en blanco y un `preparing → sent` que las dos tablas de estados
  declaran imposible. La pantalla solo ofrece "Enviar ahora" en los estados
  correctos, y eso es justo lo que CLAUDE.md dice que no es un control de
  acceso. Segundo, `report_versions_select` le daba al restaurante
  **cualquier** versión de un informe que pudiera ver, `snapshot` incluido,
  cuando lo que se le envía es **una** (RN-REP-12) y las anteriores son la
  preparación del equipo (RN-REP-13).

  Lo que se comprobó ANTES, en local y sin Docker
  (`bootstrap-postgres-local.sql`): las 86 migraciones aplican desde cero
  sobre PostgreSQL 16 y pasan las 39 suites en el orden de CI. Cuatro
  mutaciones detectadas por el motivo correcto, dos de ellas de esta
  migración: quitar la comprobación de transición deja enviar un borrador,
  y quitar el filtro por entrega devuelve al restaurante las versiones
  intermedias.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: el cuerpo de `send_report()` menciona
  `report_transition_allowed`; la política `report_versions_select` cita
  `report_version_was_delivered`; la función existe; ninguna de las dos
  tiene EXECUTE para `anon`; y `report_version_was_delivered` **conserva**
  el de `authenticated`, que es obligatorio porque aparece dentro de la
  expresión de una política y revocárselo rompería la tabla entera
  (CLAUDE.md). 132 migraciones registradas (el proyecto cuenta partes; el
  repositorio son 86 archivos).

- La **87** (`las_fechas_en_la_zona_del_espacio`, Fase 3) el 15/09/2026, por
  orden de Bosco, de una sola pieza (14 KB). Arregla un fallo que **estaba
  vivo en el proyecto** y que encontró el job `e2e-datos` la primera vez
  que CI lo ejecutó, a las 22:03 UTC — las 00:03 del día siguiente en
  Madrid.

  `x::date` sobre un `timestamptz` lo convierte con el `TimeZone` de la
  SESIÓN, que aquí es UTC siempre. CLAUDE.md manda calcular las fechas en
  la zona del espacio. Dos funciones no lo hacían:
  `claim_integration_runs()` —el solape de RN-INT-09 salía de dos días en
  vez de tres entre las 22:00 y las 24:00 UTC— y `space_calendar()` —un
  cobro que vence pasada la medianoche de Madrid se pintaba el día
  anterior, y no salía al pedir su semana—.

  **No es solo aditiva**: sustituye el cuerpo de las dos funciones y añade
  `space_timezone()`, que hace por el espacio lo que `establishment_timezone()`
  (migración 83) hace por el restaurante. Orden de despliegue: da igual.
  Ninguna pantalla llama a `space_timezone()` directamente —solo la usa
  `space_calendar()` por dentro— y las dos firmas existentes no cambian.

  Lo que se comprobó ANTES, en local y sin Docker: las 87 migraciones
  aplican desde cero sobre PostgreSQL 16 y pasan las 39 suites en el orden
  de CI; y las dos comprobaciones nuevas, verificadas en los dos sentidos
  —fallan sin la 87 y pasan con ella—, escritas para morder **a cualquier
  hora** y no solo en la ventana en la que se descubrió el fallo.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: el barrido de CLAUDE.md no encuentra ya ninguna
  función que convierta un `*_at` a día sin zona; las tres funciones
  existen; `space_calendar()` conserva sus **siete ramas** y
  `claim_integration_runs()` su bucle de comprobaciones pedidas (las dos
  cosas que la primera versión del arreglo se dejó por el camino);
  `claim_integration_runs` sigue cerrada por RPC y las otras dos abiertas
  a `authenticated` y no a `anon`; `space_timezone` es SECURITY DEFINER
  con `search_path` fijado y `space_calendar` **sigue siendo INVOKER**, que
  es lo que hace que la RLS de cada tabla la filtre. 133 migraciones
  registradas.

  `database.types.ts` regenerado desde el proyecto (87 migraciones). La
  única diferencia con el anterior es la entrada de `space_timezone`.

- La **88** (`el_comentario_de_client_can_view_reports`, Fase 3) el
  15/09/2026, por orden de Bosco. **No cambia ningún comportamiento**: el
  cuerpo de `client_can_view_reports()` llevaba dentro una frase de antes
  de la decisión 30 —"el propietario global del grupo ve el consolidado y
  el detalle de lo suyo"—, y la función nunca hizo eso: lo del consolidado
  lo deciden la política `reports_select` y el CHECK `reports_scope`.

  Se hace porque un comentario que dice la regla contraria dentro de la
  función que decide quién ve los informes es la clase de trampa con la
  que este proyecto ya ha tropezado: alguien lo lee, lo implementa, y la
  fuga entra por ahí.

  Lo que se comprobó ANTES: que el cuerpo del archivo, **sin contar
  comentarios y normalizando espacios, es idéntico al que estaba vivo en
  el proyecto**. La consulta se lanzó contra el proyecto real antes de
  aplicar nada.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: el cuerpo sin comentarios sigue siendo exactamente
  el mismo; el comentario viejo ya no está; la función **conserva el
  EXECUTE de `authenticated`** —obligatorio, porque aparece dentro de la
  expresión de `reports_select` y revocárselo rompería la política entera
  en vez de cerrarla (CLAUDE.md)— y sigue sin él para `anon`; y
  `reports_select` sigue exigiendo `establishment_id is not null` en la
  rama del cliente, que es lo que de verdad deja fuera al consolidado.

  `database.types.ts` **no cambia**, y se comprobó regenerándolo y
  comparándolo, no dándolo por hecho: `create or replace` de una función
  que ya existía, con la misma firma.

- La **89** (`plataforma_solicitud_de_espacio`, Fase 4 · Hito 17) el
  15/09/2026, por orden de Bosco, desde el MCP y en **dos partes** porque
  el archivo son 27 KB: `p1` (el permiso `can_approve_spaces`,
  `is_platform_approver()`, la tabla de transiciones y las dos tablas) y
  `p2` (las columnas de plan y prueba en `spaces`, `space_slug_from_name()`
  y las cuatro funciones de negocio). Quedaron selladas como
  `20260915085855 · ..._p1_permiso_transiciones_y_tablas` y
  `20260915121256 · ..._p2_plan_slug_y_funciones`. Solo aditiva: dos
  tablas nuevas, dos columnas anulables en `spaces` (`cuotly_plan`,
  `cuotly_trial_ends_at`), una con valor por omisión en `platform_roles`
  y ninguna función redefinida. Nada de lo desplegado hoy las lee, así que
  aplicarla antes que el código no rompe ninguna pantalla.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: `space_requests` y `space_request_events` existen
  con RLS activado; `space_requests.space_id` es anulable, que es la
  excepción documentada (una solicitud nace antes que el espacio);
  `decided_by` y `actor_id` están revocadas a `authenticated` mientras
  `business_name`, `status` y `to_status` sí se leen (RN-PLA-08);
  `is_platform_approver()` conserva el EXECUTE de `authenticated` —está
  dentro de `space_requests_select`— y no lo tiene `anon`;
  `space_slug_from_name()` está cerrada a `anon` y `authenticated`; las
  cuatro RPC de negocio están abiertas a `authenticated` y cerradas a
  `anon`; los dos CHECK (`space_requests_decision`,
  `space_requests_space`) y el índice único parcial de un borrador por
  solicitante existen; y la política de selección menciona
  `is_platform_approver()` y deja fuera el borrador. Único aviso de la
  consulta: el recuento de migraciones dio 136 y yo había escrito 135;
  el error era mío (133 tras la 87, más la 88, más las dos partes).

  `database.types.ts` regenerado y comparado: 187 líneas añadidas y
  ninguna quitada —las dos tablas con sus cinco claves ajenas, las tres
  columnas y las siete funciones—. El typecheck pasa.

- La **90** (`suscripcion_de_cuotly`, Fase 4 · Hito 18) el 15/09/2026, por
  orden de Bosco, desde el MCP y en **seis partes** porque el archivo son
  89 KB: `p1` (el permiso `can_manage_subscriptions`, el catálogo y las
  constantes, el modo del espacio con su guarda, `cuotly_subscriptions` y
  `cuotly_charges`), `p2` (`cuotly_payments`, el libro, lo derivado, los
  límites por disparador y la función del modo lectura), `p3` (el
  disparador de modo lectura sobre toda tabla con `space_id`, los CHECK de
  eventos y avisos, los avisos, mover el modo y emitir cobros), `p4`
  (`approve_space_request()` con suscripción, el relleno de espacios ya
  aprobados y el cobro manual: declarar, confirmar y registrar), `p5`
  (rechazar, revertir, adicionales y cambio de plan) y `p6` (anular el
  cambio, reactivar desde la plataforma, el barrido, la cola y la
  auditoría). Se troceó en límites de sentencia, con paridad de `$$` en
  cada parte, y antes se aplicó entera sobre una copia local de la 89 y
  se pasaron las suites 41, 40 y la de barridos del Hito 7, las tres en
  verde.

  **No es solo aditiva**, y por eso se dice lo que toca a lo que ya
  existía: reescribe `state_events_entity_type_check`,
  `notifications_event_type_check`, `notifications_entity_type_check` y
  `scheduled_jobs_kind_check` (los cuatro solo AÑADEN valores); redefine
  `approve_space_request()`, `run_scheduled_job()`,
  `enqueue_due_scheduled_jobs()`, `notification_event_is_mandatory()` y
  `audit_action_capability()` con la misma firma; y cuelga un disparador
  de modo lectura de 73 tablas. Ese disparador **no hace nada** en un
  espacio con `cuotly_status` nulo, que son los dos que hay (Restavor y el
  de demostración): el relleno de la parte 4 solo toca espacios con
  `cuotly_plan`, y no había ninguno.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: las cuatro tablas con RLS; las 73 tablas con
  `space_id` no exentas llevan su `*_cuotly_read_only` y ninguna de las
  nueve exentas lo lleva; `confirmed_by`, `rejected_by` y `reversed_by` de
  `cuotly_payments` y `created_by` del libro revocadas a `authenticated`
  mientras las de negocio sí se leen (RN-SUB-12);
  `is_platform_subscription_manager()` conserva el EXECUTE de
  `authenticated` —está en las cuatro políticas— y no lo tiene `anon`; las
  quince internas cerradas a `anon` y `authenticated`; las diez RPC
  abiertas a `authenticated` y cerradas a `anon`; las cinco columnas y los
  tres disparadores de guarda presentes; los cuatro CHECK con sus valores
  nuevos; `audit_action_capability('cuotly_charge.issued')` devuelve
  `manage_space`; `notification_event_is_mandatory('cuotly_space_archived')`
  es verdadero; ningún espacio anterior al Hito 17 tiene `cuotly_status`;
  ningún espacio con plan está sin suscripción; y 142 migraciones
  registradas (136 más las seis partes).

  `database.types.ts` regenerado y comparado: solo añade —las cuatro
  tablas, las cinco columnas y las funciones nuevas—. El typecheck pasa.

- La **92** (`onboarding_y_ciclo_de_vida_del_espacio`, Fase 4 · Hito 20)
  el 15/09/2026, por orden de Bosco, desde el MCP y en **cinco partes**
  porque el archivo son 72 KB: `p1` (los datos fiscales y el logotipo del
  espacio, el relleno desde la solicitud, los diez pasos, las
  confirmaciones y el progreso), `p2` (datos y logotipo por función, el
  modo `archived_by_owner`, `space_status_is_archived()`, las dos guardas
  de la 90 redefinidas, el último propietario y el libro del ciclo de
  vida), `p3` (el libro con su índice y política, los avisos, transferir y
  archivar), `p4` (restaurar y la exportación: tabla, columnas
  exportables y el JSON) y `p5` (quién exporta qué, la puerta, el apunte
  de auditoría, el cierre de cuenta, el catálogo de avisos, la auditoría y
  los disparadores de las tres tablas). Antes se aplicó entera sobre una
  copia local de la 91 y se pasaron las suites 43, 42, 41, 40 y la de
  barridos del Hito 7, todas en verde.

  **No es solo aditiva**, y por eso se dice lo que toca a lo que ya
  existía: un `UPDATE` de relleno sobre `spaces` que copia los datos
  fiscales de la solicitud aprobada (en el proyecto no tocó ninguna fila:
  los dos espacios no nacieron de una solicitud); `spaces_cuotly_status_check`
  reescrito con el quinto modo; `notifications_event_type_check` con dos
  avisos más; y cinco funciones redefinidas con la misma firma
  (`guard_space_cuotly_columns`, `guard_space_read_only`,
  `set_space_cuotly_status_internal`, `notification_event_is_mandatory` y
  `audit_entity_is_visible`). El único cambio de comportamiento sobre la
  90 es el que el archivo declara: el ciclo de impago ya no mueve un
  espacio que su dueño archivó.

  Comprobado en vivo DESPUÉS, con una consulta que solo devuelve problemas
  y devolvió ninguno: las tres tablas con RLS y sus cuatro políticas; los
  siete disparadores nuevos presentes y los dos que NO deben estar
  (`*_cuotly_read_only` en el libro y en las exportaciones) ausentes; las
  seis columnas de `spaces`; los tres CHECK con sus valores nuevos; las
  siete internas cerradas a `anon` y `authenticated`; las trece RPC
  abiertas a `authenticated` y cerradas a `anon`; `export_space`,
  `build_export_payload` y `exportable_columns` son `SECURITY INVOKER`,
  que es lo que hace que quien exporta se lleve exactamente lo que ve;
  `onboarding_steps()` devuelve diez; `space_status_is_archived` y
  `notification_event_is_mandatory` reconocen lo nuevo; y 151
  migraciones registradas (146 más las cinco partes).

  `database.types.ts` regenerado contra el proyecto y **sustituido
  entero**: el que dejó el hito 20 se había escrito a mano y difería del
  generado en el formato, en las claves ajenas de las tres tablas y en la
  firma de archivar y restaurar. El typecheck pasa con el generado, que
  es el que manda.

## La 49

La **49** (`hu36_ajustes_auditoria`) se aplicó el **04/09/2026**, en una
sola llamada y con el archivo íntegro (14 KB, no hubo que trocearlo).
Quedó sellada como `20260904001857 · hu36_ajustes_auditoria`.

No es solo aditiva, y por eso se preparó aparte:

- **Retira `spaces_update_owner`.** En cuanto se aplique, `spaces` se queda
  sin ninguna política de UPDATE, que en RLS significa "nadie": ni siquiera
  el propietario cambia una fila por PostgREST. El nombre (§124) y la zona
  horaria (§125) pasan a `set_space_name()` y `set_space_timezone()`, que
  dejan rastro en `audit_log`. Comprobado en el código antes de decidirlo:
  no hay **ni un solo** `.update(` sobre `spaces` en `apps/web/src`, así que
  no rompe ninguna pantalla.
- **Estrecha `audit_log_select`.** La política vigente (migración 42) deja
  ver a cualquier miembro activo todo el espacio salvo lo financiero;
  la nueva reparte por capacidad como manda §21.2. Trabajadores y Editores
  dejan de ver la configuración del espacio y la composición del equipo.
  Es el efecto buscado.

### Lo que se comprobó antes de aplicarla

1. **Las 49 migraciones aplican desde cero** sobre un PostgreSQL 16 local
   con `supabase/tests/bootstrap-postgres-local.sql`, sin Docker y sin CLI
   —lo que la versión anterior de este documento daba por imposible— y
   **las diez suites de `supabase/tests/` pasan**, más los dos scripts de
   concurrencia real de CI (`hito5-concurrency-test.mjs` y
   `hito7-concurrency-test.mjs`).
2. **Ensayo en vivo contra el proyecto, dentro de `begin` … `rollback`.**
   El archivo entero entra de una sola llamada (14 KB, no hay que trocearlo):
   al final de la transacción había 0 políticas de UPDATE sobre `spaces`,
   las 4 funciones creadas y el índice `audit_log_space_created_idx`. Tras
   el rollback se verificó que la base quedó intacta.
3. **La suite HU-36 no es un adorno**, comprobado con cuatro mutaciones,
   cada una sobre una base reconstruida desde cero (una sola base ensuciada
   da falsos positivos: el fixture no se limpia cuando la suite aborta):

   | Mutación | La suite falla con |
   |---|---|
   | `audit_entity_is_visible()` devuelve siempre `true` | "la trabajadora del restaurante A ve 2 asignaciones de trabajo (debería ver 1)" |
   | Volver a la política permisiva de la migración 42 | "un administrador ve la configuración del espacio y del equipo" |
   | Devolverle a `spaces` su política de UPDATE | "el propietario puede cambiar el espacio por UPDATE directo, sin auditoría" |
   | `set_space_timezone()` sin versionar ni exigir motivo | "se cambió la zona horaria sin motivo" |

4. **Las firmas coinciden con lo que llama la pantalla**: `set_space_name`
   (`p_space_id`, `p_name`) y `set_space_timezone` (`p_space_id`,
   `p_timezone`, `p_reason`). Un desajuste aquí sería un `PGRST202` en
   producción con la migración ya aplicada.
5. **Los datos vivos no activan el falso-cerrado.** Las 95 filas de
   `audit_log` son de cinco familias —`request`, `job`, `payment`, `charge`,
   `correction`— y las cinco están clasificadas: ninguna cae en el "solo lo
   ven el propietario y quien lo hizo" de lo desconocido.
6. **El índice nuevo no bloquea nada**: `audit_log` son 95 filas y 112 kB.
7. **`space_working_hours` está vacía** y nadie más que la pantalla de
   ajustes la lee: el motor del reloj usa `spaces.timezone`. Las versiones
   que inserta `set_space_timezone()` son historia (RN-CLK-10), no cambian
   ningún plazo vivo. La pantalla ya dice "sin versión registrada" en vez
   de inventarse una.
8. **Base de avisos antes de aplicar: 239** (`get_advisors`, seguridad).
   Eran 232 cuando se escribió el apartado de más abajo; los 7 de más son
   funciones nuevas de las migraciones 43–48, de la misma clase ya
   explicada. Tras aplicar la 49 deberían ser 241: `set_space_name` y
   `set_space_timezone` son `SECURITY DEFINER` concedidas a
   `authenticated`, y comprueban `manage_space` ellas mismas.
9. `pnpm typecheck`, `pnpm lint` y `pnpm test` (490 tests) en verde.

### Lo que se comprobó después, contra el proyecto

Primero que lo aplicado **es** lo que dice el repositorio, y no una copia
parecida: las huellas `md5` de los cuerpos de las cuatro funciones, de la
expresión de la política y de la definición del índice coinciden exactamente
con las de la base local construida desde el archivo. Y los privilegios
quedaron como manda CLAUDE.md: `anon` no puede ejecutar ninguna de las
cuatro; `authenticated` sí las cuatro, incluidas a propósito las dos que
evalúa la política de RLS.

Después, doce comprobaciones de comportamiento con las dos identidades
sembradas (`owner@cuotly.test` y `trabajadora@cuotly.test`), todas dentro de
una transacción revertida — el espacio siguió llamándose "Demo Cuotly", en
`Europe/Madrid`, con 0 versiones de calendario y las mismas 95 filas de
auditoría:

| Comprobación | Resultado |
|---|---|
| La trabajadora renombra el espacio | rechazado: "Solo el propietario del espacio puede cambiar su nombre" |
| La trabajadora cambia la zona horaria | rechazado: "Solo el propietario…" |
| El propietario por `UPDATE` directo | **0 filas cambiadas** — ya no hay política de UPDATE |
| El propietario renombra por la función | `true`, con su fila en `audit_log` |
| …y repite el mismo nombre | `false`: guardar lo mismo no ensucia el libro |
| Zona horaria sin motivo | rechazado (§21.1) |
| Zona horaria inexistente | rechazado: "La zona horaria \"Europa/Inventada\" no existe" |
| Zona horaria con motivo | `true` + las dos versiones (`contractual` y `menu_diario`), sin tocar la de soporte |
| El rastro | `space.renamed` y `space.timezone_changed`, este con su motivo |
| Auditoría que ve el propietario | 95 de 95 |
| Auditoría que ve la trabajadora | 83 de 95 |

Las 12 filas que la trabajadora no ve son las de `payment` y `charge`, que
piden `manage_finance`. Conviene decirlo sin adornos: **hoy el cambio de
§21.2 no le quita nada que antes viera**, porque las 95 filas vivas son de
cinco familias operativas y todavía no hay ni una acción de configuración
del espacio ni de composición del equipo registrada. El estrechamiento es
real, pero su efecto empieza con la primera invitación o el primer cambio
de permisos que se registre.

### Avisos: 239 antes, 242 después

Tres nuevos, todos esperados y ninguno una fuga:

- **2** de `SECURITY DEFINER` ejecutable por `authenticated`: `set_space_name`
  y `set_space_timezone`. Es exactamente lo que deben ser — las llama la
  aplicación y comprueban `manage_space` ellas mismas en la primera línea.
- **1** de `search_path` mutable en `audit_action_capability`, que se me
  había escapado al predecir 241. Es de la misma clase que los tres ya
  documentados abajo: la función es `SECURITY INVOKER` y pura (un `case`
  sobre `split_part`, sin tocar ninguna tabla), y ningún rol de la
  aplicación puede crear objetos en `public` con los que sombrear nada
  —comprobado: `anon`, `authenticated` y `service_role` tienen `CREATE`
  denegado—. Vale la pena fijarle el `search_path` en la misma migración de
  higiene que arregle las otras tres, no antes.

### Cómo se deshace

No hace falta ninguna migración inversa para volver al estado de la 48: se
recrean las dos políticas con su definición exacta de hoy, capturada del
proyecto antes de tocarlo. Las funciones nuevas pueden quedarse (nadie las
llamaría) o retirarse después.

```sql
-- Volver al estado anterior a la 49.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (
    is_platform_owner()
    or ((space_id is null) and (actor_id = auth.uid()))
    or ((space_id is not null) and is_space_member(space_id)
        and (((action !~~ 'charge.%') and (action !~~ 'payment.%')
              and (action !~~ 'subscription.%') and (action !~~ 'financial%'))
             or has_capability(space_id, 'manage_finance')))
  );

create policy spaces_update_owner on public.spaces
  for update using (has_capability(id, 'manage_space'))
  with check (has_capability(id, 'manage_space'));

drop index if exists public.audit_log_space_created_idx;
drop function if exists public.set_space_name(uuid, text);
drop function if exists public.set_space_timezone(uuid, text, text);
-- `audit_action_capability` y `audit_entity_is_visible` no existían antes
-- de la 49: al retirarlas hay que haber recreado ya la política de arriba,
-- que es quien las usaba.
drop function if exists public.audit_action_capability(text);
drop function if exists public.audit_entity_is_visible(text, uuid);
```

### Lo que queda por hacer con esto

- **La base ya va por delante del despliegue, que es el orden correcto.**
  Falta desplegar la rama con las pantallas `/ajustes` y `/ajustes/auditoria`.
- Si al guardar en `/ajustes` saliera un `PGRST202`, es la caché de esquema
  de PostgREST, no la migración: `notify pgrst, 'reload schema'`.

Los archivos grandes se trocearon por sentencias completas, respetando los
cuerpos entre `$$`. Los nombres con los que aparecen en el proyecto:

| # | Archivo del repositorio | Nombre(s) en el proyecto |
|---|---|---|
| 27 | `fix_updatable_client_views` | `fix_updatable_client_views` |
| 28 | `hito7_review_fixes_2` | `hito7_review_fixes_2` |
| 29 | `corrections_identity` | `corrections_identity` |
| 30 | `review4_fixes` | `review4_fixes` |
| 31 | `payment_methods` | `payment_methods` |
| 32 | `review5_fixes` | `review5_fixes` |
| 33 | `service_stops_at_24h` | `service_stops_at_24h_p1`, `_p2` |
| 34 | `review6_fixes` | `review6_fixes` |
| 35 | `hito8_inicio_busqueda_notificaciones` | `hito8_inicio_busqueda_notificaciones` |
| 36 | `hito8_ausencias_busqueda_calendario` | `hito8_ausencias_busqueda_calendario_p1`, `_p2` |
| 37 | `fase1_review_fixes` | `fase1_review_fixes_p1`, `_p2` |
| 38 | `fase1_review_fixes_2` | `fase1_review_fixes_2_p1`, `_p2` |
| 39 | `fase1_review_fixes_3` | `fase1_review_fixes_3` |
| 40 | `plan_change` | `plan_change_p1`, `_p2` |
| 41 | `queue_and_sweeps` | `queue_and_sweeps_p1`, `_p2` |
| 42 | `hu05_sessions` | `hu05_sessions` |
| 43 | `client_request_job` | `client_request_job` |
| 44 | `retry_request_analysis` | `retry_request_analysis` |
| 45 | `storage_bucket_files` | `storage_bucket_files` |
| 46 | `consumption_threshold_client_only` | `consumption_threshold_client_only` |
| 47 | `task_assignment` | `task_assignment` |
| 48 | `hu07_service_subscriptions` | `hu07_service_subscriptions_p1`, `_p2` |
| 49 | `hu36_ajustes_auditoria` | `hu36_ajustes_auditoria` |
| 50 | `bandeja_de_conversaciones` | `bandeja_de_conversaciones` |
| 51 | `borrador_de_solicitud` | `borrador_de_solicitud`, `revoke_anon_convert_conversation_to_request` |
| 52 | `cola_llena_y_vencimiento` | `cola_llena_y_vencimiento` |
| 53 | `cobro_de_mejora_en_el_libro` | `cobro_de_mejora_en_el_libro` |
| 54 | `inicio_del_espacio` | `inicio_del_espacio` |
| 55 | `ficha_del_restaurante` | `ficha_del_restaurante` |
| 56 | `compartir_con_el_restaurante` | `compartir_con_el_restaurante` |
| 57 | `datos_del_establecimiento` | `datos_del_establecimiento_p1_columnas`, `_p2_permiso_y_barrera`, `_p3_set_data` |
| 58 | `alta_del_restaurante` | `alta_del_restaurante_p1_columnas`, `_p2_set_data`, `_p3_create`, `_p4_auditoria_group` |
| 59 | `instagram_del_restaurante` | `instagram_del_restaurante` |
| 60 | `evidencia_de_publicacion` | `evidencia_de_publicacion` |
| 61 | `acceso_revocado_en_la_ficha` | `acceso_revocado_en_la_ficha` |
| 62 | `prioridad_del_restaurante` | `prioridad_del_restaurante` |
| 63 | `premium_concede_prioridad` | `premium_concede_prioridad` |
| 64 | `la_prioridad_mueve_la_cola` | `la_prioridad_mueve_la_cola` |
| 65 | `coordinacion_de_tareas` | `coordinacion_de_tareas_p1`, `_p2` |
| 66 | `notas_internas` | `notas_internas` |
| 67 | `auditoria_de_las_notas` | `auditoria_de_las_notas` |
| 68 | `historial_del_restaurante` | `historial_del_restaurante` |
| 69 | `el_motivo_del_estado` | `el_motivo_del_estado` |
| 70 | `dar_acceso_a_un_restaurante` | `dar_acceso_a_un_restaurante` |
| 71 | `el_aviso_de_la_reasignacion` | `el_aviso_de_la_reasignacion` |
| 72 | `lo_que_ya_se_hace_no_se_reordena` | `lo_que_ya_se_hace_no_se_reordena` |
| 73 | `el_coste_de_la_ia_en_milicentimos` | `el_coste_de_la_ia_en_milicentimos` |
| 74 | `el_cuarto_caso_de_rn_est_04` | `el_cuarto_caso_de_rn_est_04` |
| 75 | `condiciones_versionadas_y_aceptadas` | `condiciones_versionadas_y_aceptadas_p1`, `_p2` |
| 76 | `el_aviso_de_las_condiciones_nuevas` | `el_aviso_de_las_condiciones_nuevas` |
| 77 | `menu_diario_menus_versiones_y_actualizaciones` | `..._p1_servicio_plantillas_ciclos`, `_p2_menus_versiones_publicaciones`, `_p3_preparar_y_pedir`, `_p4_equipo_cancelar_auditoria` |
| 78 | `menu_diario_plantillas_y_descargas` | `menu_diario_plantillas_y_descargas` |
| 79 | `menu_diario_equipo_cola_y_correccion` | `..._p1_candidatos_cola_correccion`, `_p2_avisos_barrido_busqueda` |
| 80 | `calendario_completo_y_presupuestos` | `..._p1_mensualidad_del_servicio`, `_p2_calendario_quotes_y_avisos`, `_p3_crear_enviar_aceptar_rechazar`, `_p4_inicio_cliente_plantillas_auditoria` |
| 81 | `integraciones_conexiones_y_sincronizacion` | `..._p1_cuentas_y_tablas`, `_p2_permisos_avisos_y_personas`, `_p3_credencial_cola_archivar_auditoria` |

La numeración del proyecto no coincide con la del repositorio porque el
proyecto sella cada migración con la hora a la que se aplicó; lo que manda
es el orden, y el orden es el mismo.

### La 55 · la ficha del restaurante

Aplicada el 09/09/2026. Añade una sola función,
`establishment_client_users()`, que es lo único de la ficha de §15.2 que no
se podía consultar ya con RLS: `establishment_memberships` la lee el equipo
sin problema, pero `profiles_select` solo deja ver el perfil de quien
comparte **espacio**, y un cliente no es miembro del espacio. Sin ella, la
pestaña Usuarios enseñaría uuids.

Comprobada en vivo con las identidades sembradas: el propietario del
espacio ve al responsable del restaurante con su nombre, su rol y sus
permisos finos; **el cliente recibe cero filas**, no una lista distinta. La
función no tiene rama de cliente a propósito —la identidad no viaja hacia
él (RN-MSG-02)—, y está revocada a `anon`.

Con ella queda cerrada la última salvedad de `database.types.ts`: ya no hay
ninguna función escrita a mano esperando a que se aplique su migración. Al
regenerar contra el proyecto, la firma salió **idéntica** a la que estaba
escrita a mano, así que no había desviación que corregir.

### La 56 · compartir con el restaurante

Lo que hace, entero: `revoke all ... from public, anon` más `grant execute
... to authenticated` sobre las **siete** funciones que escriben archivos
—`share_file_with_client`, `register_file`, `add_file_version`,
`archive_file`, `request_file_permanent_deletion`,
`attach_file_to_message` y `upload_payment_receipt`—. Ni una función nueva,
ni un cambio de lógica, ni una tabla tocada.

Por qué hacía falta: un proyecto de Supabase concede `EXECUTE` por defecto
a `anon` y `authenticated` sobre toda función nueva, y el Hito 7 no revocó
ninguna de las siete. **Comprobado en vivo** sobre un PostgreSQL 16 con las
55 migraciones aplicadas desde cero: las siete devolvían `t` para
`has_function_privilege('anon', ..., 'execute')`. No eran explotables —las
siete comprueban el permiso por su cuenta y sin sesión `auth.uid()` es
null—, pero son escrituras accesibles por RPC sin haber iniciado sesión.
Es lo mismo que encontró la migración 51 con
`convert_conversation_to_request()`.

Lo que se comprobó antes de darla por buena, en local y sin Docker
(`supabase/tests/bootstrap-postgres-local.sql`):

- Las **56 migraciones** aplican desde cero sobre una base vacía.
- Las **15 suites** de `supabase/tests/` pasan, en el orden de CI, sobre
  esa base recién construida — las 14 que ya había más la nueva
  `compartir_con_el_restaurante.sql`.
- Las siete funciones pasan de `anon = t` a `anon = f`, conservando
  `authenticated = t`.
- **Cuatro mutaciones**, para que la suite nueva no sea un adorno: (1)
  devolverle a `anon` el `EXECUTE` de `share_file_with_client` la hace
  fallar; (2) darle a `files` una política de UPDATE, también; (3) quitarle
  a `share_file_with_client()` su `return` de idempotencia deja dos apuntes
  de auditoría y falla; (4) hacer que `can_read_file()` ignore la
  visibilidad del cliente le enseña los tres archivos y falla. Restaurado
  todo, la suite vuelve a verde.

Cómo se deshace, si hiciera falta: `grant execute on function <cada una>
to anon;`. No hay nada más que revertir.

Lo que NO toca, y conviene saberlo antes de "completar" el trabajo:
`can_read_file()` y `can_write_file()` siguen abiertas a `anon`. Aparecen
dentro de las políticas de RLS de `files`, `file_versions` y `file_links`,
que PostgreSQL evalúa con los privilegios de quien consulta, así que
tocarlas es de la familia de la excepción documentada en la migración 32 y
no se hace de paso en una migración de otra cosa. Sin privilegio de
columna sobre esas tablas, `anon` no puede leerlas de todos modos.

### La 57 · los datos del establecimiento

Lo que hace, entero:

1. **Trece columnas nuevas en `establishments`**, todas `text` y todas
   nulas: `legal_name`, `tax_id`, `address`, `postal_code`, `city`,
   `contact_email`, `phone_primary`, `phone_secondary`, `website_url`,
   `domain`, `opening_hours` y `web_platform` (más una restricción `check`
   sobre la última, con dos valores). Aditivo puro.
2. **Dos funciones nuevas**: `set_establishment_data()` y
   `client_can_edit_establishment_data()`, las dos revocadas a `public` y
   `anon` y concedidas a `authenticated`. Aditivo puro.
3. **`drop policy establishments_update`** — esto NO es aditivo.
4. **Un disparador `before update`** que rechaza cualquier cambio de esas
   trece columnas (y de `name`) que no venga de `set_establishment_data()`,
   con su función revocada a `public`, `anon` y `authenticated`.

**Qué puede romper el punto 3, comprobado antes de escribirlo:** nada del
código actual escribe `establishments` por PostgREST. Ni una llamada
`.update()` en `apps/web`, y las siete funciones SQL que tocan la tabla
—las del ciclo de impago y `set_establishment_status()`— son
`security definer`, así que se ejecutan como el dueño y RLS no les aplica.
Lo que el punto 3 cierra es lo que **habría podido** hacer un
administrador con la clave pública y un `curl`: reescribir el CIF de un
cliente sin actor y sin valor anterior.

**Qué puede romper el punto 4:** un UPDATE legítimo que toque una de esas
columnas sin pasar por la función. Hoy no existe ninguno, y el disparador
solo salta si la columna **cambia de verdad** (`is distinct from`), así que
`set_establishment_status()`, que escribe únicamente `status`, sigue
pasando. Está comprobado con su propio bloque en
`supabase/tests/datos_del_establecimiento.sql`.

**Cómo se deshace:** `drop trigger establishments_guard_data on
public.establishments;` devuelve la tabla a estar escribible por función, y

```sql
create policy establishments_update on public.establishments
for update
using (public.has_capability(space_id, 'create_establishment'))
with check (public.has_capability(space_id, 'create_establishment'));
```

restaura la política tal como estaba en la migración 8. Las columnas y las
funciones se pueden dejar: son aditivas y no molestan.

**Al aplicarla hay que regenerar `database.types.ts`.** Sus tipos están
hoy escritos a mano (la salvedad está dicha en la cabecera del archivo), y
al regenerar contra el proyecto hay que comprobar que la firma sale igual,
como se hizo con la 55.

### La 58 · el alta de un restaurante

Aplicada el 10/09/2026, en cuatro partes.

Lo que hace, entero:

1. **Cuatro columnas nuevas en `establishments`**: `contact_name`,
   `instagram`, `facebook_url` —los tres campos de la maqueta 02 que no
   existían— y `idempotency_key`, con un índice único parcial sobre
   `(space_id, idempotency_key)`. Aditivo puro.
2. **`set_establishment_data()` con firma nueva** (16 parámetros en vez de
   13). Se **borra la anterior** antes de crearla: dejar las dos la habría
   vuelto ambigua por RPC, y PostgREST habría elegido una u otra según los
   argumentos sin fallar nunca.
3. **`create_establishment_with_data()`**, la puerta del alta: comprueba
   `create_establishment`, resuelve o crea el grupo, inserta el
   establecimiento, llama a `set_establishment_data()` para la ficha y a
   `create_plan_subscription()` si se eligió plan, todo en una
   transacción. Revocada a `public` y `anon`, concedida a `authenticated`.
4. **`drop policy establishments_insert`** — esto NO es aditivo.
5. **`audit_action_capability()` reescrita** para repartir la familia
   `group` (que ahora escribe `group.created`) como `manage_clients`. Sin
   esto, el apunte existiría y no lo vería nadie: la función clasifica lo
   que no conoce como "lo decide la fila", y `audit_entity_is_visible()`
   devuelve `false` para un tipo de entidad que no está en su `case`.

**Qué rompió el punto 4, y cómo se arregló.** Tres sitios escribían
`establishments` por PostgREST: la acción `createEstablishment()` del
navegador (sustituida por la función) y dos bloques de
`supabase/tests/hito2_permisos.sql` (reapuntados a la función). El fallo
salió al ejecutar las suites contra un PostgreSQL local con las 59
migraciones desde cero, no en producción.

**Cómo se deshace.** `drop function create_establishment_with_data(...)` y
`create policy establishments_insert on public.establishments for insert
with check (public.has_capability(space_id, 'create_establishment'))`. Las
columnas se pueden dejar: son nulas y no estorban.

### La 59 · el usuario de Instagram, no su host

Aplicada el 10/09/2026. Corrige un fallo de la 58 encontrado
comprobándola en vivo contra el proyecto, antes de subirla: la
normalización del campo de Instagram quitaba el prefijo
`https://instagram.com/` y **después** cortaba por la primera barra
siempre, así que un perfil escrito sin esquema se guardaba como el host:

```
instagram.com/magarinos           ->  @instagram.com      (mal)
www.instagram.com/magarinos       ->  @www.instagram.com  (mal)
instagram.com/magarinos?hl=es     ->  @magarinos?hl=es    (mal)
```

Escribir el perfil sin `https://` es lo normal, así que no era un caso
raro: era el caso. Y el dato quedaba guardado mal en silencio.

Solo cambia el bloque de Instagram de `set_establishment_data()`; el resto
de la función es idéntico a la 58 (plpgsql no permite parchear un cuerpo:
`create or replace` sustituye la función entera o nada). Los siete casos
están en `supabase/tests/alta_del_restaurante.sql`, y se comprobó que la
suite **falla** con la versión de la 58 puesta de vuelta: un test que pasa
igual con el fallo no vale para nada.

## Cómo quedó el esquema

|  | Antes (hasta la 26) | Hasta la 42 | Hasta la 49 |
|---|---|---|---|
| Tablas | 50 | 57 | **57** |
| Tablas con RLS | 50 | 57 | **57** (todas) |
| Funciones | 136 | 176 | **187** |
| Políticas | — | 96 | **95** |

Las políticas bajan de 96 a 95 con la 49: retira `spaces_update_owner` y
sustituye `audit_log_select` por otra más estrecha.

Las siete tablas nuevas son `absences`, `notifications`,
`notification_preferences`, `notification_deliveries`, `scheduled_jobs`,
`plan_commitments` y `scheduled_plan_changes`.

## Lo que se comprobó después de aplicarlas

No se pudo hacer la comparación contra una base reconstruida desde cero
que sugería la versión anterior de este documento: en el contenedor de
desarrollo no hay demonio de Docker ni CLI de Supabase, así que `supabase
start` no se puede levantar. En su lugar se comprobó, contra el proyecto:

> **Esto dejó de ser cierto el 04/09/2026.** Con
> `supabase/tests/bootstrap-postgres-local.sql` y el PostgreSQL 16 que ya
> viene instalado en el contenedor, la base sí se reconstruye desde cero
> sin Docker y sin CLI; la cabecera de ese archivo trae la receta. Lo que
> sigue se mantiene tal cual porque es lo que se hizo entonces.

- que existen **las 7 tablas, las 12 políticas y las 41 funciones** que
  declaran las migraciones 27–42, y las 4 columnas nuevas
  (`requests.accepted_start_sla_hours`, `request_versions.space_id`,
  `establishment_memberships.revoked_at`, `group_memberships.revoked_at`);
- que **`assert_establishment_not_suspended` ya no existe** — la migración
  33 la renombra a `assert_establishment_service_running` y borra la
  anterior a propósito, para que no quede un nombre que miente;
- que las 57 tablas tienen RLS activado, sin excepciones;
- y, ya con el espacio de demostración sembrado, que el recorrido completo
  (solicitud → clasificación → validación → aceptación → asignación →
  comienzo → publicación → cobro → pago) deja los libros coherentes: 2
  apuntes de consumo, 12 eventos de contador, 20 filas de auditoría, 16
  avisos y 14 correos en cola, todos generados por las funciones reales.
  Eso último es la comprobación de que el cableado de avisos de las
  migraciones 37 y 38 funciona de punta a punta, no solo de que compila.

## Avisos del analizador de Supabase

`get_advisors` devolvía 232 avisos cuando se escribió este apartado y hoy
devuelve 242 (las funciones nuevas de las migraciones 43–49). Ninguno es
una regresión; conviene saber qué son antes de que alguien los descubra y
crea que son nuevos:

- **226 `WARN` de funciones `SECURITY DEFINER` ejecutables por `anon` o
  `authenticated`.** El analizador no distingue una función interna de una
  que comprueba permisos por su cuenta. Las internas ya están revocadas
  (migraciones 24, 30, 32, 41); las que quedan abiertas lo están a
  propósito, porque las llama la aplicación y comprueban `auth.uid()`
  ellas mismas, o porque una política de RLS las evalúa con los
  privilegios de quien consulta y revocarlas rompería la política
  (CLAUDE.md lo explica y la migración 32 enumera las ocho). Quien manda
  aquí es el barrido de `supabase/tests/hito7_mensajes_archivos_finanzas.sql`,
  no este analizador.
- **2 `ERROR` de `security_definer_view`**, sobre `client_jobs` y
  `client_establishment_status_events`. Son las dos vistas barrera: NO
  llevan `security_invoker` a propósito, porque existen justamente para
  tapar columnas de identidad del equipo. Las migraciones 27 y 28 les
  revocan toda escritura y les conceden solo `select`.
- **4 `WARN` de `search_path` mutable** en `job_load_points`,
  `task_load_points`, `task_weight_for_minutes` y `audit_action_capability`
  (esta última desde la 49). Son funciones de cálculo puro, sin acceso a
  tablas. Vale la pena fijarles el `search_path` en una
  migración futura por higiene, pero no hay fuga.
- **1 `INFO`**: `space_sequences` tiene RLS y ninguna política. Es
  deliberado y está documentado en la migración 34: la tabla no la toca
  nadie salvo `next_space_sequence()`, y se le quitaron los privilegios a
  `anon` y `authenticated` en vez de añadirle una política que no hace
  falta.

## El bucket de archivos

Creado el 03/09/2026 por la migración 45. Es el sitio donde viven los
bytes de todo lo que sube alguien: justificantes de cobro (HU-26),
adjuntos de los mensajes (HU-35) y el resto del catálogo de RN-ARC.

| | |
|---|---|
| Nombre | `files` |
| Público | **no** |
| Tamaño máximo por archivo | 26 214 400 bytes (25 MB, RN-ARC-06) |
| Tipos permitidos | los 11 de la lista blanca de RN-ARC-06 |
| Políticas en `storage.objects` | **ninguna**, a propósito |

Cero políticas con RLS activado significa "nadie": ni `anon` ni
`authenticated` pueden tocar un objeto, aunque Supabase les conceda de
fábrica los GRANT de tabla. Las dos únicas puertas son el `service_role`
—solo desde el servidor de la aplicación— y las URLs firmadas, que
autorizan una ruta concreta y las emite el servidor después de comprobar
el permiso en la base de datos.

Es deliberado, y es lo contrario de lo que suele hacerse: quién puede
subir y quién puede ver ya está escrito una vez, en `can_write_file()` y
`can_read_file()`, con RN-ARC-04, RN-ARC-05 y RN-FIN-07 dentro. Repetirlo
en políticas que parsean el nombre del objeto sería tenerlo en dos sitios.

### Cómo comprobar que el bucket funciona

Los permisos se comprueban con SQL; mover bytes, no. Para eso está
`pnpm comprobar:storage`, que funciona tanto en la raíz del repositorio
como en `apps/web`.

En PowerShell la variable va antes y en su propia línea — la forma
`VAR=valor comando` es de bash y en PowerShell no funciona:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<la clave secreta>"
pnpm comprobar:storage
```

En bash o zsh vale la forma de una línea:

```bash
SUPABASE_SERVICE_ROLE_KEY="<la clave secreta>" pnpm comprobar:storage
```

Recorre el camino entero —firma de subida, subida sin sesión, metadatos
del objeto guardado, enlace firmado de descarga, bytes idénticos— y
además comprueba que el bucket está cerrado: que con la clave pública no
se puede listar ni descargar por ruta, y que no hay URL pública. Al
terminar retira lo que subió.

**Ejecutado el 03/09/2026 por Bosco, con todas las comprobaciones en
verde.** Con eso el camino de los archivos está visto funcionar de punta a
punta: el bucket con su configuración, la subida sin sesión con URL
firmada, los metadatos reales del objeto, la descarga firmada devolviendo
los mismos bytes, y el bucket cerrado a la clave pública.

## El espacio de demostración

`supabase/seed/espacio-demo.sql` siembra un espacio completo para recorrer
los flujos. Es idempotente y NO es una migración (por eso vive fuera de
`supabase/migrations/`: si estuviera ahí, `supabase db reset` metería
datos de prueba en el historial del esquema).

Está sembrado en el proyecto ahora mismo. Tres identidades, todas con la
contraseña `Cuotly-demo-2026`:

| Correo | Papel |
|---|---|
| `owner@cuotly.test` | Propietaria del espacio (equipo) |
| `trabajadora@cuotly.test` | Trabajadora que ejecuta los trabajos |
| `restaurante@cuotly.test` | Propietario local del restaurante (cliente) |

Espacio `demo` ("Demo Cuotly", Europe/Madrid, IVA 21 %), restaurante
`EST-0001` ("Bar Demo") con plan Impulso, y cuatro solicitudes dejadas a
propósito en cuatro estados distintos para que ninguna pantalla se quede
sin caso que enseñar:

| Solicitud | Estado | Trabajo |
|---|---|---|
| SOL-0001 | Borrador | — |
| SOL-0002 | Recibida (T1 corriendo) | — |
| SOL-0003 | En curso | TRB-0001, en curso (T3 corriendo) |
| SOL-0004 | Publicada | TRB-0002, publicado, con ventana de corrección abierta |

Más un cobro de Impulso (399 € + 21 % = 482,79 €) emitido y pagado por
transferencia, para que Finanzas no esté vacía.

El sembrado ha crecido desde entonces: hay tres identidades más
(`trabajador2@`, `magarinos@` y `sala.magarinos@`), un segundo restaurante
para los recorridos que ESCRIBEN (`EST-0002`, "Café Prueba") y un tercero,
**Magariños** (`EST-0003`), que es el que llena las pantallas: plan
Premium con Menú Diario, 19 solicitudes en ocho estados, 15 trabajos, cinco
archivos y su mensualidad pagada. La lista completa, con el porqué de cada
uno, está en la cabecera del propio archivo.

Desde el 10/09/2026 hay un cuarto, **Casa Sol** (`EST-0004`), y es el único
que entra por `create_establishment_with_data()` —la función de la
migración 58, la que ejecuta la pantalla `/restaurantes/nuevo`— en vez de
por un INSERT. Está para tener los cuatro casos que a los otros tres les
faltan: plan **Básico** (que no incluye ningún cambio, así que el Resumen
enseña un ciclo sin barra), estado **Configurando**, la mensualidad
**emitida y sin pagar**, y **ningún acceso de cliente** todavía. Sus datos
se escriben sin normalizar a propósito —CIF en minúsculas, web y Facebook
sin esquema, Instagram con el `?hl=es` pegado— para que el sembrado
ejercite la normalización de la 58 y el arreglo de la 59.

**Aviso, porque costó encontrarlo:** la migración 58 metió `p_contact_name`
en medio de `set_establishment_data()`, y la llamada del sembrado iba por
posición. A partir de esa migración el archivo entero moría en esa línea
con `El correo de contacto no tiene forma de correo: 910 123 456`, así que
**el sembrado estuvo roto un día entero sin que nada lo dijera**: CI no lo
ejecutaba. Ahora la llamada va por nombre (`p_x := …`) y CI lo ejecuta dos
veces al final del job `rls-tests`, que es además la única comprobación
real de que sigue siendo idempotente.

### Entrar con info@restavor.com

Es el correo con el que se usa Cuotly de verdad: el de `CUOTLY_OWNER_EMAIL`
y el que reconoce `is_platform_owner()`. Ser propietario de la plataforma
**no da acceso a ningún espacio** —el Modo soporte es de la Fase 4 (PRD
§4.1)—, así que para ver el espacio de demostración hace falta una
membresía como la de cualquiera, y eso es lo que le da la última sección
del sembrado: propietario del espacio `demo`.

Dos pasos, en este orden:

1. **Registrarse una vez** en la aplicación con `info@restavor.com` (o
   entrar con Google si es esa la cuenta). El sembrado **no crea** esa
   cuenta a propósito: escribir en el repositorio una cuenta real con la
   contraseña de demostración sería publicar la credencial del
   administrador.
2. **Ejecutar el sembrado**. Si la cuenta existe, deja el aviso
   `info@restavor.com es propietario del espacio de demostración`; si no,
   avisa de que hay que registrarse primero y no falla.

Ejecutarlo otra vez no rompe nada: la membresía se vuelve a crear (el
sembrado rehace el espacio entero) y la cuenta, que vive fuera del espacio,
no se toca nunca.

## Recorrer los flujos con Playwright

`apps/web/e2e/flujos-espacio-demo.spec.ts` entra con los tres usuarios y
recorre las pantallas sobre los datos de arriba. Nueve tests, en cuatro
grupos: dónde aterriza cada papel (HU-02, los dos lados), que el equipo NO
ve el borrador del cliente y el cliente SÍ, que la bolsa del plan refleja
lo consumido de verdad (14 de 16 pequeños), y que el cliente no ve el
nombre de nadie del equipo (CA-04).

Se ejecuta **aparte de la suite normal**, con una señal explícita:

```bash
cd apps/web
pnpm test:e2e         # los 14 de siempre; los de datos se saltan con motivo
pnpm test:e2e:datos   # E2E_DATOS=1 · los 9 que necesitan base de datos
```

El script pasa por `cross-env`. No es adorno: `E2E_DATOS=1 playwright test` a
secas es sintaxis POSIX y en Windows revienta antes de arrancar, con
`"E2E_DATOS" no se reconoce como un comando interno o externo`. Con
`cross-env` la variable se pone igual en bash, en cmd y en PowerShell.

La suite con datos corre contra una **compilación de producción**, no
contra `next dev`: Playwright lanza `pnpm build && pnpm start`. La razón no
es purismo, es que tres rondas de fallos seguidos fueron todas el servidor
de desarrollo compilando y renderizando bajo demanda mientras varios tests
le pedían pantallas — `waitForURL` agotados, estados que no aparecían a
tiempo, tests muertos por el reloj, y ni uno solo era un fallo del
producto. Cuesta un `build` al principio; a cambio la ejecución deja de
depender de la suerte. `pnpm test:e2e` (la del armazón) sigue con `next
dev`.

Por eso el script pone también `E2E_DIAGNOSTICO=1`: `/api/diagnostico`
existe siempre en desarrollo, y fuera de desarrollo solo con esa variable,
que no está puesta en ningún despliegue real.

Si prefieres no usar el script, el equivalente a mano en PowerShell es
`$env:E2E_DATOS="1"; npx playwright test flujos-espacio-demo`.

La señal es `E2E_DATOS=1` y no "¿hay NEXT_PUBLIC_SUPABASE_URL?" por dos
motivos, los dos escritos en la cabecera del archivo: Playwright no lee
`apps/web/.env.local` (eso lo hace Next.js al arrancar el servidor), así
que mirar esas variables desde el proceso de Playwright daría "no
configurado" siempre y el archivo se saltaría entero pareciendo verde; y
con la señal puesta y la base caída, los tests **fallan** en vez de
saltarse, que es lo correcto cuando has pedido el recorrido con datos.

Antes de lanzarlo, tres cosas y ninguna es opcional:

1. `apps/web/.env.local` apuntando al proyecto.
2. El sembrado aplicado.
3. **`SUPABASE_SERVICE_ROLE_KEY` en ese mismo `.env.local`.** Los
   recorridos de CA-19 la necesitan: al enviarse una solicitud, el
   servidor la clasifica y graba la propuesta con
   `record_classification()`, que está reservada a `service_role` porque
   RN-CLS-01 dice que eso no puede depender de lo que afirme el cliente.
   Sin esa clave la solicitud se queda en "Recibida" y el recorrido se
   para en el segundo paso. La consola del servidor de desarrollo lo dice
   con todas las letras (`[clasificación] Falta SUPABASE_SERVICE_ROLE_KEY…`).

Para comprobar el punto 3 sin adivinar, con el servidor levantado:
`curl http://localhost:3000/api/diagnostico`. Esa ruta solo existe en
desarrollo y solo devuelve booleanos —nunca el valor de nada—, y dice qué
variables ve **el proceso que atiende**, que no siempre es lo mismo que lo
que hay escrito en el archivo. Los tests de CA-19 la consultan antes de
empezar y se paran ahí con el motivo si falta la clave.

Si la clave está en el archivo y el servidor sigue sin verla, **borra la
carpeta `apps/web/.next`**: la caché de Turbopack persiste entre arranques.

Y **cierra cualquier `pnpm dev` que tengas escuchando en el 3000** antes
de lanzar `pnpm test:e2e:datos`. Playwright ya no reutiliza un servidor
existente en la ejecución con datos, precisamente por esto: Next.js lee
`.env.local` **al arrancar**, así que un servidor levantado antes de
añadir la clave sigue sin verla y el fallo aparece donde no está la
avería. Si el puerto está ocupado, Playwright lo dirá.

## Estado: los quince pasan, y los ejecuta CI en cada push

**15 passed** en CI el 15/09/2026, con el job `e2e-datos`. Antes de eso:
**12 passed**, en Windows, el 02/09/2026 — los nueve de lectura y los
tres del recorrido de CA-19 a 390 px. Se cerraron desde una máquina con
salida al dominio del proyecto, no desde el contenedor de Claude Code: la
política de salida de ese entorno bloquea el dominio, así que allí la
aplicación Next.js no llega a Supabase aunque el sembrado sí esté puesto.

```
$ curl https://mcajbfxhkxtdhjoyrqha.supabase.co/rest/v1/
connect_rejected — gateway answered 403 to CONNECT
```

El conector MCP sí llega, por otra ruta permitida, y por eso desde el
contenedor se pueden aplicar migraciones y sembrar datos, pero no correr
estos tests. Quien los toque desde ahí los verá fallar en el login, con la
página mostrando "No hemos podido conectar para comprobar tus datos. Es un
problema nuestro o de tu conexión, no de tu contraseña." Ese mensaje es
`src/core/auth-errors.ts` distinguiendo un fallo de red de una contraseña
mala; hasta el 10/09/2026 decía "Correo o contraseña incorrectos" ante
cualquier fallo y el bloqueo parecía un problema de la semilla.

### Desde el 14/09/2026 los ejecuta CI, y no necesitan el proyecto real

Que dependieran de una máquina concreta de Bosco era el hueco más grande
de la red de seguridad, y costó un fallo real: el restaurante con Menú
Diario tuvo un 404 en **todas** sus pantallas durante días porque dos
guardas comparaban `role !== "client"` a mano. Ninguna prueba unitaria
montaba esas dos páginas; los recorridos, que sí lo habrían visto, no
corrían.

El job **`e2e-datos`** de `.github/workflows/ci.yml` los ejecuta en cada
push. La clave es que **no necesitan el proyecto real**: necesitan *un*
Supabase con las migraciones y el espacio de demostración sembrado, y eso
es lo que `supabase start` levanta en el runner — lo mismo que ya hacía
`rls-tests`. Por tanto el job **no usa ningún secreto**: las claves del
Supabase local las imprime `supabase status -o env` y no son un secreto, y
`SUPABASE_SERVICE_ROLE_KEY` sale de ahí igual. Tampoco hace falta
`ANTHROPIC_API_KEY`: sin ella el clasificador cae a las reglas
(`toRuleProposal(..., "no_api_key")`), que es justo lo que el Hito 4 pedía
comprobar.

Lo que se verificó desde el contenedor antes de subirlo, que es todo menos
la base de datos: que la suite **no se salta** con `E2E_DATOS=1` (una
suite que se salta sola dejaría el job verde sin haber probado nada), que
`next build` y `next start` levantan el servidor de producción, y que el
único fallo es el de red, con ese mensaje y no otro.

### Lo que encontró la primera vez que se ejecutó

Seis vueltas de CI, de 11 recorridos en verde a 15. Lo que salió:

1. **Un fallo horario vivo en el proyecto real.** La primera ejecución
   coincidió con las 22:03 UTC —las 00:03 del día siguiente en Madrid— y
   puso en rojo `rls-tests`, que había pasado veinte minutos antes.
   `claim_integration_runs()` y `space_calendar()` convertían un
   `timestamptz` a día con la zona de la **sesión**. Lo arregla la
   migración 87, y un barrido nuevo impide que la clase vuelva.

2. **Un incumplimiento de CA-19** que llevaba ahí desde el rediseño del
   Inicio: sus dos tarjetas medían **931 px** en una pantalla de 390,
   porque un elemento de grid tiene `min-width: auto` y no encoge por
   debajo de su contenido. `min-w-0` lo cierra, y de paso hace que sirvan
   para algo los `truncate` de las tres listas.

3. **Seis expectativas de test caducadas**, todas del mismo tipo: un
   titular que cambió al rediseñar la pantalla, cuatro `getByText` que
   encontraban más de un elemento —hasta **siete**, en la pantalla de
   equipo— y un contador de descargas que no se refresca porque descargar
   es un GET y no una acción de servidor. Ninguna era un fallo del
   producto; todas fingían estar verdes porque nadie las ejecutaba.

El primer fallo de todos no se pudo diagnosticar con lo que el test
decía —"se desborda" y nada más—, así que la comprobación de CA-19 nombra
ahora los cinco elementos que se salen, con sus clases y cuántos píxeles
se pasan. Dio el culpable en la vuelta siguiente.

### Lo que encontraron al ejecutarse por primera vez

Valió la pena escribirlos: de cuatro tandas en rojo, **dos fallos eran de
la aplicación**, no de los tests ni del sembrado. Ninguno se habría visto
sin datos reales y tres identidades distintas.

1. **El sembrado creaba usuarios que no podían entrar.** Insertar en
   `auth.users` a mano no basta: cuatro campos de texto quedaban a NULL y
   GoTrue no sabe leerlos, y faltaba la fila en `auth.identities`. Ver la
   cabecera de `supabase/seed/espacio-demo.sql`, que ahora lo explica y lo
   comprueba antes de dar el sembrado por bueno.

2. **Un espacio con dos personas nunca redirigía.** `app/page.tsx` contaba
   los espacios sin filtrar por usuario, apoyándose en RLS para algo que
   RLS no hace: `space_memberships_select` es `is_space_member(space_id)`,
   que deja ver a todo el equipo. Salía una fila por miembro y el selector
   pintaba el mismo espacio repetido. Se dispara con cualquier espacio
   real.

3. **El cliente nunca veía sus restaurantes.** El slug del espacio salía de
   un embed `spaces(slug)` y el cliente no puede leer `public.spaces`.
   Mismo fallo que la migración 36 documentó para la búsqueda global, misma
   solución: `space_slug()`. Y de paso, con un solo restaurante ahora se
   entra directamente, como manda el PRD §20.1.

Los otros dos fallos sí eran de los tests: un `getByText("Recibida")` que
chocaba con la cabecera de columna del mismo nombre, y un `entrar()` que
esperaba a salir de `/login` cuando entrar encadena dos redirecciones de
servidor.
