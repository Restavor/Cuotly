# Estado del despliegue en Supabase

Este archivo dice **qué migraciones del repositorio están aplicadas en el
proyecto real de Supabase** (`Cuotly`, `mcajbfxhkxtdhjoyrqha`, eu-west-1).
Existe porque el repositorio y el proyecto pueden ir desacompasados, y
adivinarlo mirando el esquema es justo la clase de suposición que ha
costado caro en este proyecto.

Actualizado el 12/09/2026.

## Pendiente de aplicar

**Las migraciones 71, 72 y 73**, las tres del 12/09/2026:

- **71 · `el_aviso_de_la_reasignacion`** — ensancha dos CHECK de
  `notifications` (dos tipos de evento nuevos y `task` como tipo de
  entidad) y hace que `request_job_reassignment()` y
  `request_task_reassignment()` avisen a propietario y administradores.
- **72 · `lo_que_ya_se_hace_no_se_reordena`** — saca `in_progress` de
  `request_is_rankable()`. **No es solo aditiva**: al aplicarla, las
  solicitudes en curso que tuvieran puesto en la cola lo sueltan y el resto
  se compacta. Eso lo hace la propia migración, una vez, con las mismas dos
  sentencias de la 64. Para deshacerla habría que volver a poner
  `in_progress` en la función; los puestos soltados no se recuperan, y no
  hace falta que se recuperen: se recalculan ordenando otra vez.
- **73 · `el_coste_de_la_ia_en_milicentimos`** — añade
  `ai_usage.estimated_cost_millicents`, rellena lo ya escrito con
  céntimos × 1000, ata las dos columnas con un CHECK y **borra y recrea**
  `record_classification()` con el parámetro renombrado. Al recrearla, los
  privilegios vuelven a los de por defecto de Supabase: el `revoke` final
  del archivo es imprescindible, y conviene comprobar después que ni `anon`
  ni `authenticated` tienen EXECUTE sobre ella.

Las tres se han aplicado desde cero sobre un PostgreSQL 16 local con el
`bootstrap-postgres-local.sql` y las 28 suites en verde. En el proyecto
real no las ha aplicado nadie todavía.

## Aplicadas

**Las 70 primeras migraciones del repositorio están aplicadas.** Las tres
de la 49 a la 51 se aplicaron el 04/09/2026 —el
apartado "La 49" de más abajo cuenta lo que se comprobó antes y después de
la que no era solo aditiva, y cómo se deshace si hiciera falta—, las 52 a
54 el 08/09/2026, la 55 el 09/09/2026, las 56 a 63 el 10/09/2026 y las 64 a 70
el 11/09/2026.

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

## Estado: los doce pasan

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
estos tests. Quien los toque desde ahí verá los nueve fallar en el login,
con la página mostrando "Correo o contraseña incorrectos." — que es lo que
devuelve `signIn` cuando no puede hablar con Supabase, y no un problema de
credenciales.

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
