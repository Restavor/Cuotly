# Plan de la Fase 1 · Agente Menú Diario

| | |
|---|---|
| Fecha | 03/10/2026 |
| Estado | **APROBADO por Bosco el 03/10/2026, con cambios** (D1 A, D2 A, D3 A; D4 con permiso y correo `menu@restavor.com`; D5: el cierre no espera a las 48 h). La regla de publicación cambió: decisión 156, que **sustituye a lo que dicen aquí y en el PRD sobre la víspera de las 17:00** (la matriz del anexo A es de la regla antigua). **Pasos:** 1.0 a 1.2 hechos y revisados · 1.3: Bar Demo relanzado, alta del agente pendiente de que Bosco cree la cuenta · 1.4 y 1.5 pendientes |
| Fuente | PRD `agents/menu-diario/PRD.md` §14 «Fase 1», `RECONOCIMIENTO.md` y decisiones 151 a 155. Reconocimiento previo de solo lectura con cinco exploradores en paralelo (anexos A a E) |

---

## 1. Qué ha cambiado desde la Fase 0 (comprobado el 03/10/2026)

| # | Hecho | Cómo se comprobó | Por qué importa |
|---|---|---|---|
| 1 | El repositorio `Restavor/Cuotly` es **público**. El PRD (R2) lo daba por privado | API de GitHub sin credenciales: `private: false` | Los registros de Actions los lee cualquiera y los artefactos los descarga cualquier cuenta de GitHub. La cuenta del agente en LandingSite es administradora de la única web de Restavor. Además, el código completo del producto es visible |
| 2 | La contraseña de las cuentas de demostración está escrita en 8 archivos versionados (13 tras unir las pruebas de Reservas) (`supabase/seed/`, `docs/`, tests, scripts) | `git grep` | Si esas cuentas existen en «Restavor pruebas», cualquiera que conozca esa base podría entrar como administrador de demo. **No lo he probado** (sería escribir sesiones en la base) |
| 3 | Nuestra rama iba **7 commits por detrás de `agents`** (Fases C, D y E1 de Reservas) y `agents` ya usaba las decisiones **112 a 143**. Las del agente, que entonces eran la 112 a 116, repetían esos números. **Al unir, y otra vez cuando `agents` llegó a la 150, pasaron a la 151 a 155**; las de la Fase 1 son la 156 a 158 | `git rev-list`, `docs/DECISIONES.md` de `origin/agents` | Al unir las ramas hubo conflicto en `DECISIONES.md` (resuelto dos veces) |
| 4 | La rama por defecto del repo es `claude/cuotly-build-from-scratch-okynpm` (antigua, es la rama de producción de cuotly-movil en Vercel) | API de GitHub | Un `schedule` de Actions **solo corre desde la rama por defecto** |
| 5 | **Bar Demo se resembró hoy a las 13:43 UTC y está vacío otra vez**: sin plataforma web, sin dirección, sin plantilla, sin menús. La base tiene 175 migraciones. La cuenta del agente no existe | Consulta de solo lectura | R3 del PRD ya no se cumple. Hay que relanzar `sql/bar-demo-pruebas.sql` antes de la prueba en seco, y se repetirá con cada resembrado |
| 6 | Esta sesión **no tiene ninguna credencial** del agente ni de LandingSite (solo `GITHUB_TOKEN` y la URL de la API) | Nombres de variables de entorno, sin valores | Sin `AGENTE_EMAIL` y `AGENTE_PASSWORD` no se puede demostrar `agente:seco` contra la base real desde aquí |
| 7 | El informe de «cuánto dura la sesión» necesita **48 horas reales** | PRD §14 | La Fase 1 no se puede cerrar en una sola sesión |
| 8 | Un trabajador sin especialidades queda fuera del reparto de **menús**, pero entra en el de **trabajos y tareas** (C2, ya conocido). En Bar Demo pasaría de 2 a 3 candidatos de trabajo y de 3 a 4 de tareas | Definiciones vivas con `pg_get_functiondef` | La decisión 153 lo cerrará con una marca en la Fase 2. Para la Fase 1 solo hay un puente: marcarlo «no disponible» (cierra trabajos y menús; **no** cierra tareas, ni el listado de carga, ni lo que ve por estar autorizado) |

## 2. Cómo se hace (en orden)

| Paso | Qué | Qué demuestra | Necesita de Bosco |
|---|---|---|---|
| 1.0 | Poner la rama al día con `agents` (merge) y renumerar las decisiones del agente a 151–155, porque `agents` llegó hasta la 150 (en `DECISIONES.md`, `CLAUDE.md`, `docs/PRD.md` RN-CRE-25, `RECONOCIMIENTO.md`) | `pnpm typecheck && pnpm lint && pnpm test` en verde tras el merge | D1 |
| 1.1 | Esqueleto: `agents/menu-diario/` como paquete del workspace (añadir `agents/*` a `pnpm-workspace.yaml`, regenerar `pnpm-lock.yaml`), lint estricto, vitest, `CLAUDE.md` del agente (Apéndice A adaptado a pnpm), `docs/reglas.md` con RA-01 a RA-07 | CI en verde; el lint falla a propósito si `src/core` importa Supabase/Next/React o usa `any` | — |
| 1.2 | Funciones puras de tiempo (`computePublishFrom` = `calcularPublicarDesde`; `orderAndFilter` = `ordenarYFiltrar`) con unos 170 tests (la estimación inicial era ~58), incluidos los cambios de hora del 29/03/2026 y el 25/10/2026 con valores UTC exactos | Tests verdes; cada caso de PRD §7.1 mapeado a un test | — |
| 1.3 | Alta del agente en Bar Demo (script SQL validado en un PostgreSQL local desechable) + línea base de recuentos | Consultas: trabajador activo, 0 especialidades, autorizado solo en Bar Demo, fuera de `menu_candidate_ids` y de `job_candidate_ids` | D4, y crear tú la cuenta (§5) |
| 1.4 | `pnpm agente:seco`: inicia sesión como el agente, lee la cola y dice qué haría y cuándo. Cliente **solo lectura** con tres capas (lista cerrada de tablas, columnas y RPC; `fetch` que solo deja pasar GET y el login; lint que prohíbe `.insert/.update/.delete`) | Recuento de todas las tablas de `public` antes y después **medido por mí desde fuera** con acceso de administrador de la base (el agente no puede ver todo `audit_log`: 181 de 229 filas) | Credenciales en el entorno y sesión nueva |
| 1.5 | Workflow de Actions que comprueba cada ~4 h durante 2 días que la sesión filtrada de LandingSite sigue valiendo (solo abre el editor y lee; no edita, no usa el chat de IA) + prueba aparte del inicio de sesión con contraseña desde Actions | Código y tests con servidores simulados; primer disparo manual; informe `INFORME-SESION.md` a las 48 h | D2, D3, secretos, y estar presente en la prueba de login |

**Lo que puedo cerrar en esta sesión:** 1.0, 1.1 y 1.2 enteros; el código y los tests de 1.3, 1.4 y 1.5. **Lo que no:** las demostraciones reales de 1.3 y 1.4 (necesitan tus credenciales y una sesión nueva) y el informe de 1.5 (48 h de espera).

## 3. Decisiones que necesito de Bosco (la recomendada va primero)

**D1 · Rama.** (A, recomendada) Unir antes `agents` en nuestra rama y renumerar las decisiones del agente (al final, a 151–155, porque `agents` avanzó dos veces). (B) Seguir sin actualizar y resolver el conflicto al final. Motivo: cada commit nuevo en una rama desfasada aumenta el conflicto, y la base de pruebas ya tiene las migraciones 169 a 175, que nuestra rama no tiene.

**D2 · Visibilidad del repo.** (A, recomendada) Pasarlo a **privado** antes de construir el workflow. (B) Dejarlo público y limitar el workflow: sin capturas ni artefactos, sesión solo en un secreto que cargas tú, sin renovarse entre ejecuciones (mide la vida mínima, no la real). Motivo de A: protege el código de tu producto y los registros; permite encadenar la sesión cifrada entre ejecuciones sin ir a tu ordenador; es lo que supone el PRD. Coste de A: GitHub da 2.000 min/mes gratis en privado y el CI gasta unos 14 min por subida (estimación de los exploradores, sin comprobar); si se agotan, ~0,008 $/min. Se decide antes de guardar nada de LandingSite. **No bloquea 1.0 a 1.2.**

**D3 · Cómo se lanzan las comprobaciones cada 4 h** (solo para el paso 1.5; puede esperar). (A, recomendada) Una tarea programada de esta plataforma lanza el workflow con `workflow_dispatch` desde la rama de trabajo (decisión 157); no se toca nada de producción, pero depende de que esta sesión siga viva y es menos fiable. (B) Subir un único archivo a la rama antigua por defecto: el `schedule` de GitHub es fiable, pero dispara un despliegue de producción de cuotly-movil (solo redirige) y su CI antiguo, y hay que borrarlo después (otro despliegue). Hay precedente del 24/09 con tu permiso. (C) Cambiar la rama por defecto del repo a `agents`: no he podido comprobar qué haría con Vercel.

**D4 · Permiso de escritura en «Restavor pruebas», solo Bar Demo** *(resuelta: permiso de Bosco, decisión 159)*, por las funciones de la app y como Elena (mismo alcance que la decisión 154): (1) relanzar `bar-demo-pruebas.sql` (plataforma y dirección, Menú Diario con pago de demostración, plantilla, un menú en borrador; lo ajusto para que la fecha sea «mañana» y no caduque); (2) alta del agente (trabajador activo, sin especialidades, autorizado solo en Bar Demo, marcado «no disponible» como puente; deja 1 apunte de auditoría); (3) **nuevo:** pedir la publicación de ese menú para que `agente:seco` tenga algo real que mostrar. Efecto de (3): se asigna sola a `trabajadora@cuotly.test` y avisa en la campana a administradores; no sale ningún correo (pruebas no tiene Resend). Recomendación: sí a las tres. Sin (3), la prueba en seco saldría vacía y esos casos solo se demostrarían con tests. **El agente no se autoriza en Magariños** (web real) en ningún caso.

**D5 · Cómo se cierra la fase.** *(Resuelta por Bosco: el cierre no espera a las 48 h, decisión 160.)* (A, recomendada) Doy por terminado el trabajo de la Fase 1 sin el informe y dejo el informe como punto abierto con un recordatorio a las 48 h. **No empiezo la Fase 2 hasta que haya informe**, porque su resultado puede cambiar la arquitectura (PRD P4: si el inicio de sesión desde Actions pide código por correo o lo frena Cloudflare, el robot pasa a un servidor propio). (B) No dar la fase por cerrada hasta tener el informe.

## 4. Lo que decido yo salvo que Bosco diga lo contrario

- **Nombres en inglés** (`computePublishFrom`, `orderAndFilter`, estados `preparing`, `waiting`, `ready`, `publishing`, `verifying`, `published`, `error`, `session_blocked`, `cancelled`, `returned`). `CLAUDE.md` manda en convenciones y el PRD (§0, §8) lo permite. El texto visible sigue en español vía `src/i18n/es.ts`. Los scripts conservan `agente:seco`, `agente:login`, `agente:e2e` (precedente: `comprobar:storage`). Dejo una tabla de equivalencias en el `CLAUDE.md` del agente.
- **pnpm en vez de npm**, por `CLAUDE.md`. Actualizo los textos del PRD (Apéndices A y C) que dicen `npm`.
- **Reglas RA-01 a RA-08** registradas en `agents/menu-diario/docs/reglas.md`, con tests que empiezan por «RA-01 · …», y una frase en `CLAUDE.md` para que cuenten igual que las RN-xxx. Solo RA-01 se testea en la Fase 1; el resto se marca con la fase en que se cubre.
- **«Ahora»** es el instante en que se hace el cálculo, no la hora a la que el cliente pidió publicar. Consecuencia: un menú de hoy pedido a las 23:58 y procesado a las 00:03 cuenta como fecha pasada. **«Fecha pasada»** se vuelve a comprobar cada vez que el robot decide (publicar el menú de ayer tapando el de hoy sería peor que un aviso).
- **Regla de orden:** ocupan la web `publishing`, `verifying` y `published`. Dos casos que el PRD no resuelve **no los invento**: una tarea atascada en `publishing` tras un corte (bloquearía para siempre a las anteriores) y una tarea en `error` después de haber subido. Quedan escritos como abiertos para las Fases 2 y 5.
- **Un menú de un día posterior publicado a mano por una persona** no bloquea al agente (la regla solo habla de tareas). `agente:seco` lo muestra como aviso «sin regla».
- **Restaurantes activados en la prueba en seco:** los que cumplan *agente autorizado + LandingSite + no borrado*, con filtro opcional `--restaurante`. Sustituye a `agente_menu.restaurantes`, que llega en la Fase 2.
- **`--ahora=<fecha-hora>`** en `agente:seco`, con un cartel «RELOJ SIMULADO» bien visible, para enseñar hoy/mañana/3 días/ayer con un solo menú. Si Bosco no lo quiere (la decisión 151 dice «no se simula»), esos casos se demuestran solo con tests.
- **Un test SQL nuevo, sin migración** (`supabase/tests/agente_menu_seco.sql`) que falla si `team_menu_queue`, `menu_deadlines` o su cadena dejan de ser de solo lectura.
- **Corrijo textos que ya no son ciertos:** PRD §3.5, D9 y §7.7 («el reparto normal no cambia»), D2/D3/§9.4 (entrar con Google), R2 (repo privado), el criterio de aceptación de la Fase 1 (`menu_candidate_ids` solo cubre menús; añado `job_candidate_ids` y `list_task_candidates` con su límite conocido) y `RECONOCIMIENTO.md` («Bar Demo está listo»).

## 5. Lo que tendrá que hacer Bosco cuando toque (no ahora)

1. **Crear la cuenta del agente en Restavor web** (Supabase de «Restavor pruebas» → Authentication → Users → Add user, con *Auto Confirm User*), con una contraseña larga de su gestor, **nunca por el chat**. Correo: `menu@restavor.com` (decisión 157; su buzón está conectado con el de info@restavor.com, así que no hay que crear otro; no es `@cuotly.test`, y eso es lo que importa: el sembrado borra esas cuentas).
2. **Guardar las credenciales sin pasarlas por el chat:** `RESTAVOR_SUPABASE_URL`, `RESTAVOR_SUPABASE_ANON_KEY`, `AGENTE_EMAIL`, `AGENTE_PASSWORD` en el entorno de la nube (esta sesión no las recoge: hace falta una sesión nueva) y como secretos de Actions. Para el workflow de sesión, además `LANDINGSITE_EMAIL`, `LANDINGSITE_PASSWORD` y `SESION_CLAVE`. Son dos cuentas distintas: la del agente en Restavor web y la del agente en LandingSite.
3. **Estar delante en la prueba de inicio de sesión con contraseña desde Actions** (un intento por prueba, máximo 3 en toda la fase; el workflow pide tu aprobación). LandingSite puede pedir un código por correo para un dispositivo nuevo o Cloudflare puede frenarlo; no se intenta esquivar ninguno de los dos.
4. **Borrar `sesion-landingsite.json` y los archivos de sesión de la Fase 0** en tu ordenador (credencial viva de la cuenta del agente mientras no caduque) y generar una sesión nueva con hora conocida.
5. **Mirar el número de versiones de LandingSite** tras el primer disparo (abrir el editor podría tener algún efecto que no está comprobado). Eran 371.

## 6. Lo que queda para otras fases (anotado, no se decide ahora)

- **Fase 2:** diseño de la marca que saca al agente de los repartos (decisión 153) y, con ella, si también se cierran las tareas, el listado de carga y los permisos por estar autorizado. El agente, por estar autorizado, **puede registrar pagos y leer finanzas, conversaciones e informes** del restaurante. En Bar Demo (datos inventados) no importa; en la Fase 7 sí. Cómo calcula `publicar_desde` el despachador (Edge Function en Deno frente a las funciones TypeScript con imports sin extensión), y si va en SQL o en TypeScript.
- **Fases 4 y 5:** el PRD mantiene el plazo de las 08:00 (`menu_publish_by_at − 60 min`) para escalar errores y caducar el token, mientras `RN-CRE-24` y `CLAUDE.md` dicen «sin hora de corte». Se confirma antes de la Fase 4.
- **Fase 5:** calibrar el umbral de la comparación de imágenes con dos PNG que solo cambien la fecha; qué hacer si el repo sigue público y la Fase 5 pide capturas como artefacto (PRD §6.2-8).
- **Defecto en Restavor web, fuera de este paquete (no se ha tocado):** `zonedTimeToUtc` de `apps/web/src/core/business-clock.ts` (reloj laboral, RN-CLK-06) no coincide con PostgreSQL al oeste de Greenwich cuando la hora local cae en el hueco o la repetición del cambio de hora (America/New_York, 08/03/2026 02:30: 06:30Z frente a 07:30Z). Con las horas normales, y en Europe/Madrid y Atlantic/Canary, coincide: hoy no afecta a ningún espacio. La versión corregida y sus 36 valores de PostgreSQL están en `agents/menu-diario/src/core/local-time.ts` y `local-time.test.ts`. Pendiente de decidir con Bosco si se corrige también en `apps/web` (toca el reloj laboral de los plazos contractuales).
- **Umbral de «sesión muy frágil» (PRD P4):** **no lo invento**. Lo fija Bosco cuando vea los datos del informe.

---

# Anexos (material de los exploradores, sin editar)

Los nombres de archivos y funciones de los anexos son de borrador. En el código van en inglés, por `CLAUDE.md`.


---

## Anexo A · Funciones de tiempo y matriz de tests (RA-01)

> **Superado en parte por la decisión 156 (03/10/2026).** La matriz de abajo (A04 a A09, A17 a A29, A36 a A38) calcula la regla ANTIGUA: un menú de otro día se publicaba a las 17:00 de la víspera. La regla vigente es: hoy → al llegar; otro día → 07:00 del día del menú. Los tests definitivos y sus valores, contrastados con PostgreSQL, están en `agents/menu-diario/src/core/*.test.ts`. Lo que sigue valiendo: la matriz B (orden), los casos de «hoy», «ayer» y 23:59, y el diseño de contratos.

**Resumen del explorador:** SOLO LECTURA hecho: no se ha editado nada del repo (git status limpio); las pruebas de código se ejecutaron en copias en el scratchpad (/tmp/claude-0/-home-user-Cuotly/.../scratchpad/probe) y en "Restavor pruebas" solo con SELECT / pg_get_functiondef. Resumen: (1) Restavor web NO usa ninguna librería de fechas (ni date-fns-tz, ni luxon, ni Temporal: en Node 22 `typeof Temporal` es undefined); todo es `Intl.DateTimeFormat`. Ya existen helpers probados con DST que cubren el 100 % de lo que necesita RA-01: `zonedTimeToUtc` (apps/web/src/core/business-clock.ts:164), `localDateOf`, `addDays`, `isValidLocalDate/Time` (apps/web/src/core/reservations/dates.ts) y `Result` (core/result.ts). Recomendación: REUTILIZAR, detrás de un único archivo-puente en el agente, y no escribir lógica de zona nueva. (2) menu_cutoff_at y menu_publish_by_at son funciones SQL (migración 77) que calculan `((target_date-1) + 21:00)` y `(target_date + 08:00)` como hora de pared local con `at time zone spaces.timezone`; la regla RA-01 no usa ninguna de las dos (solo HORA_VISPERA 17:00), pero mi propuesta da exactamente los mismos instantes que PostgreSQL para 17:00 en los días de cambio de hora (verificado en la base de pruebas). (3) El contrato es sencillo: `computePublishFrom({targetDate, now, timeZone, eveHour}) -> Result<{at: Date(UTC), reason}, error>` y `orderAndFilter(tasks, {now, timeZone}) -> decisiones ordenadas`, ambas puras, con el reloj inyectado. (4) Hay 10 decisiones abiertas reales (listadas abajo); las que más pesan: qué estados cuentan como "ya publicado o en curso" (y qué pasa con una tarea atascada en `publishing` tras un corte, que bloquearía a las anteriores para siempre), si "fecha pasada" se vuelve a comprobar al ejecutar, qué hacer con una HORA_VISPERA en el hueco/repetición del cambio de hora (con 17:00 no ocurre), y que el PRD escribe nombres en español (`calcularPublicarDesde`, estados `preparando`...) cuando CLAUDE.md exige identificadores en inglés. (5) Matriz propuesta: 40 casos de computePublishFrom y 18 de orderAndFilter, con valores calculados a mano y comprobados dos veces (PostgreSQL de pruebas y una implementación candidata ejecutada en scratchpad); los casos que dependen de una decisión abierta van marcados [DEP Dn].

**Preguntas que planteó:**
- D1 · Nombres en inglés o en español. CLAUDE.md manda identificadores en inglés; el PRD del agente escribe calcularPublicarDesde, ordenarYFiltrar y estados como preparando/lista/publicando. Recomiendo inglés (computePublishFrom, orderAndFilter; preparing, waiting, ready, publishing, verifying, published, error, session_blocked, cancelled, returned) y que el texto para ti y los emails siga en español por i18n. ¿Lo confirmas?
- D2 · ¿Qué reloj es 'ahora' al calcular publicar_desde? Recomiendo el instante en que el despachador o el robot hace el cálculo, no la hora a la que el restaurante pidió publicar (menu_publications.requested_at). Consecuencia: un menú de hoy pedido a las 23:58 y procesado a las 00:03 se trata como fecha pasada.
- D3 · ¿Se vuelve a comprobar 'fecha pasada' cada vez que el robot decide (no solo al crear la tarea)? Recomiendo que sí (y que 'fecha pasada' gane si además hay bloqueo por día posterior): publicar el menú de ayer tapando el de hoy sería peor que un aviso. El PRD solo lo exige al crear (§6.2-1).
- D4 · Qué estados de tarea cuentan como 'ya publicada o en curso' en la regla de orden. Propongo publishing, verifying y published. Dos casos sin resolver en el PRD: (a) una tarea en `error` DESPUÉS de haber hecho la subida (la web pudo cambiar); (b) una tarea atascada en publishing o verifying tras un corte de la ejecución, que con esta regla bloquearía para siempre a las anteriores del mismo restaurante. No quiero inventar un plazo ni una regla de rescate: ¿quieres que (a) cuente como ocupada y que (b) se resuelva en la Fase 2 con una regla tuya?
- D5 · Mismo restaurante y misma fecha de menú (solo ocurre al republicar o tras cancelar y crear otro menú): no se bloquean entre sí; desempate por fecha de creación y luego id. Si hubiera dos listas a la vez, ¿se publican las dos en orden (la última queda en la web) o solo la más reciente?
- D6 · HORA_VISPERA en el hueco o la repetición del cambio de hora (solo si se configura entre 02:00 y 02:59; con 17:00 no ocurre nunca). Recomiendo copiar lo que hace la base para el corte de las 21:00: hora inexistente => se desplaza hacia delante (02:30 pasa a 03:30), hora repetida => la segunda. La alternativa de Reservas es rechazar la inexistente y tomar la primera. ¿Y qué valores admite HORA_VISPERA (¿solo HH:MM válido, o también un tope como 'no más tarde de las 21:00')?
- D7 · Prueba en seco de la Fase 1: aún no hay tabla de tareas. ¿Qué cuenta ahí como 'ya publicado'? (a) nada: solo se ve el orden y la fecha pasada; (b) también los menús `published` del mismo restaurante leídos de la base. Y, para la regla en general: ¿un menú de un día posterior publicado a mano por una persona debe bloquear al agente? El PRD solo habla de tareas del agente.
- D8 · ¿Dónde se registran RA-01..RA-07? Propongo un archivo agents/menu-diario/docs/reglas.md (como docs/agents/reglas.md) y tests que empiecen por 'RA-01 · ...'. Alternativa: pasarlas a códigos RN en docs/PRD.md.
- D9 · Ubicación y herramientas: carpeta agents/menu-diario/src/core con un archivo-puente que reutilice los helpers de apps/web/src/core (recomendado), añadir agents/* a pnpm-workspace.yaml (cambia el lockfile) y usar pnpm en vez de npm (agente:seco, agente:login...). ¿De acuerdo? Y para el despachador de la Fase 2: ¿calcula publicar_desde en TypeScript (Edge Function, hay que empaquetarla) o en SQL (misma semántica que menu_cutoff_at)?
- D10 · Si una tarea está `lista` pero su publicar_desde aún no ha llegado (no debería pasar), ¿ordenarYFiltrar la ignora (recomendado, defensa extra) o confía en el estado?
- D11 · Confirmación: el PRD del agente (§3.6, §7.5) mantiene el plazo de las 08:00 (publish_by_at - 60 min) para escalar errores y la caducidad del token de aprobación, aunque RN-CRE-24 dijo que no hay hora de corte para el cliente. ¿Es correcto que el agente lo use como referencia interna? (No afecta a la Fase 1.)

**Contradicciones que encontró:**
- Idioma de los identificadores: el PRD del agente pide funciones `calcularPublicarDesde()` y `ordenarYFiltrar()` (§14 Fase 1), estados de tarea en español (`preparando`, `esperando`, `lista`, `publicando`, `bloqueada_sesion`...), esquema `agente_menu`, tablas y columnas en español (`tareas`, `publicar_desde`, `aprobada_version_id`) y RPC `agente_menu_*`. CLAUDE.md (Estilo de código) exige identificadores, tablas, columnas y funciones en INGLÉS y el texto visible en español vía i18n. El propio PRD (§0) dice que en convenciones de código manda CLAUDE.md, y §8 dice 'adapta los nombres a las convenciones del repositorio', pero el nombre de las funciones de la Fase 1 sí está escrito en español. Propuesta: computePublishFrom / orderAndFilter y estados preparing, waiting, ready, publishing, verifying, published, error, session_blocked, cancelled, returned (pregunta D1).
- Gestor de paquetes: el PRD (§5.2 y Apéndice A: `npm test`, `npm run agente:seco`, `npm run agente:login`; Apéndice C instruye a Bosco con `npm run agente:login`) frente a CLAUDE.md y el repo (pnpm 9.15, workspaces, `pnpm test`, CI con --frozen-lockfile). Manda CLAUDE.md: los scripts serían `pnpm agente:seco` etc. y habría que actualizar los textos del Apéndice C que ve Bosco.
- Códigos de regla: el PRD del agente usa RA-01..RA-07, que no existen en docs/PRD.md ni en docs/agents/reglas.md; CLAUDE.md solo nombra RN-xxx (y RN-APP/AGT/RES/LLA para agents). No hay un sitio donde registrarlas (pregunta D8).
- Plazos de 21:00 y 08:00: el PRD del agente (§3.6, §7.5) los mantiene como 'referencia para escalar' (menu_publish_by_at - 60 min), mientras RN-CRE-24 (docs/PRD.md, decisión 85) y CLAUDE.md dicen 'sin hora de corte, sin recordatorio de las 20:00'. El PRD aclara que ya no generan avisos, así que no es un choque frontal, pero reintroduce una hora límite de cara al equipo (la de publicación, 08:00); las funciones SQL siguen existiendo (las usa la migración 152 como hecho, no como promesa). No afecta a la Fase 1, sí a la Fase 4/5 (caducidad del token, escalado). Pregunta de confirmación a Bosco.
- PRD §3.4: 'las funciones menu_cutoff_at/menu_publish_by_at' se citan como disponibles para el robot, pero están REVOCADAS a authenticated (migración 77, líneas 788-789); el robot (usuario agente, authenticated) solo puede leer los plazos con menu_deadlines(p_menu_id) o con las columnas cutoff_at y publish_by_at de team_menu_queue. Ya lo anotaba el informe de la Fase 0 (C9).
- Comentario obsoleto en la migración 77 (línea 786-787): dice que `src/core/daily-menu.ts` calcula lo mismo que menu_cutoff_at para una fecha sin menú, pero daily-menu.ts ya no contiene esa lógica desde la decisión 85. Significa que NO hay un gemelo TypeScript del corte/publish_by que reutilizar; si hacen falta (Fase 4: caducidad del token), hay que escribirlo.
- PRD §6.2-1 calcula publicar_desde en el despachador (Edge Function, Deno) y §7.1 pide una función pura en el robot (Node): la misma regla en dos runtimes. Los archivos del repo que daría gusto reutilizar usan imports sin extensión, que Deno no admite. No es un choque con CLAUDE.md, pero sí una decisión de arquitectura que el PRD no cierra.

**Riesgos:**
- Tarea atascada en `publishing`/`verifying` tras un corte de la ejecución: con la lectura literal de la regla de orden, cuenta como 'en curso' y bloquea con error a todas las tareas anteriores del mismo restaurante, sin plazo ni rescate definidos en el PRD (el despachador solo vigila `bloqueada_sesion` y la aprobación). Hay que cerrarlo antes de la Fase 5.
- Las implementaciones ingenuas fallan justo los días de cambio de hora (domingos 29/03/2026 y 25/10/2026): 'target menos 24 h' (A17, A25), 'medianoche + 17 h' (A18, A26), 'hoy según UTC' (A14, A23) y 'el día dura 24 h' (A22, A28). Los tests propuestos están hechos para pillarlas; sin reutilizar localDateOf/zonedTimeToUtc sería fácil reintroducirlas.
- Doble semántica de hora inexistente/repetida en el repo: zonedTimeToUtc y PostgreSQL (hueco se desplaza hacia delante, repetida = segunda) frente a localToUtc de Reservas (hueco = error, repetida = primera). Si el agente usa una en TypeScript y alguna función SQL futura usa la otra, publicar_desde diferirá una hora solo para HORA_VISPERA entre 02:00 y 02:59.
- Portabilidad: los helpers reutilizables usan imports sin extensión (no corren con `node archivo.ts` ni en Deno). Si el despachador (Edge Function) llama a computePublishFrom en TypeScript hará falta empaquetar con esbuild o duplicar; no comprobado qué admite el CLI de Supabase para importar fuera de supabase/functions. Añadir agents/* al workspace cambia pnpm-lock.yaml y el CI usa --frozen-lockfile.
- Tres funciones distintas calculan 'hoy en la zona' en el repo (localDateOf, todayInTimeZone, dayKeyInTimeZone): si el agente usara otra de ellas el comportamiento sería equivalente pero la cobertura de DST no.
- La copia de target_date y publicar_desde en la tarea puede quedar obsoleta: update_menu_details (migración 152) permite cambiar target_date de un menú; el PRD ya prevé el webhook de `menus` update, pero la tarea debe recalcular publicar_desde (y, si cambia la zona con set_space_timezone, también).
- Efectos de la regla literal que el equipo debe conocer: (a) si el restaurante edita y vuelve a pedir el menú de hoy después de las 17:00, cuando ya se publicó el de mañana, la republicación de hoy se bloquea con error; (b) en modo `aprobacion`, si se aprueba antes el de mañana que el de hoy, el de hoy se bloquea; (c) un menú de un día posterior publicado a mano por una persona no bloquea al agente (la regla solo ve tareas), y el agente podría taparlo.
- Carrera cerca de medianoche: un menú de hoy pedido a las 23:58 y procesado a las 00:03 se convierte en 'fecha pasada' y se reporta como error al equipo (depende de D2 y D3).
- Zona o instante inválidos lanzan RangeError en Intl (localDateOf con 'No/Existe' o con Date inválida; verificado): hay que convertirlos en errores de resultado. pg_timezone_names admite nombres que Intl podría no aceptar: no comprobado qué nombres.
- Fuente de datos de la prueba en seco: team_menu_queue no devuelve la versión ni menús ya publicados, y no existe aún la tabla de tareas; sin la decisión D7 la prueba en seco no puede mostrar el caso 'ya hay publicado un día posterior' con datos reales (solo con datos de test).
- No comprobado en esta investigación: ejecución de la suite vitest del repo (no se corrió), importación cruzada desde agents/ con vitest, comportamiento en Deno, y si hay menús o restaurantes de Bar Demo que ya disparen la regla (no se leyeron filas de menus/menu_publications más allá de índices y definiciones).

**Diseño propuesto:**

```text
UBICACIÓN Y PUENTE. agents/menu-diario/src/core/ con: time.ts (puente: reexporta zonedTimeToUtc de apps/web/src/core/business-clock, localDateOf/addDays/isValidLocalDate/isValidLocalTime/LocalDate/LocalTime de apps/web/src/core/reservations/dates y Result/ok/err de apps/web/src/core/result), publish-from.ts, order.ts y sus .test.ts. Añadir agents/* a pnpm-workspace.yaml (y regenerar el lockfile). Vitest en entorno node. Ningún `new Intl.DateTimeFormat` nuevo. Texto visible ('La fecha del menú ya ha pasado', 'Ya hay publicado un menú de un día posterior') en agents/menu-diario/src/i18n/es.ts, nunca en el core. Nombres en inglés [DEP D1; el PRD los llama calcularPublicarDesde y ordenarYFiltrar].

CONTRATO 1 (publish-from.ts).
type LocalDate = string; // 'YYYY-MM-DD'    type LocalTime = string; // 'HH:MM'
export const DEFAULT_EVE_HOUR: LocalTime = '17:00';
export type PublishFromInput = { targetDate: LocalDate; now: Date; timeZone: string; eveHour: LocalTime };
export type PublishFrom = { at: Date /* instante UTC -> timestamptz */; reason: 'today' | 'eve' | 'eve_already_passed' };
export type PublishFromError = 'date_in_past' | 'invalid_date' | 'invalid_eve_hour' | 'invalid_time_zone' | 'invalid_now';
export function computePublishFrom(i: PublishFromInput): Result<PublishFrom, PublishFromError>;
Algoritmo: validar entradas (atrapar RangeError de Intl) -> today = localDateOf(now, tz) -> si target < today: err('date_in_past') -> si target === today: ok({at: now, reason:'today'}) -> eve = zonedTimeToUtc(año, mes, día de addDays(target,-1), hh, mm, tz) -> si eve > now: ok({at: eve, reason:'eve'}) si no ok({at: now, reason:'eve_already_passed'}). Pura: nunca lee el reloj del sistema.

CONTRATO 2 (order.ts).
export const TASK_STATES = ['preparing','waiting','ready','publishing','verifying','published','error','session_blocked','cancelled','returned'] as const;
export const WEB_OCCUPYING_STATES = ['publishing','verifying','published'] as const; // [DEP D4]
export type OrderTask = { id: string; establishmentId: string; targetDate: LocalDate; state: TaskState; publishFrom: Date; createdAt: Date };
export type OrderReason = 'date_in_past' | 'later_day_already_published';
export type OrderDecision<T extends OrderTask> = { task: T; action: 'publish' } | { task: T; action: 'report_error'; reason: OrderReason; blockedBy?: string };
export function orderAndFilter<T extends OrderTask>(tasks: readonly T[], ctx: { now: Date; timeZone: string }): readonly OrderDecision<T>[];
Semántica: candidatas = state === 'ready' [y publishFrom <= now, DEP D10]; orden (targetDate asc, createdAt asc, id asc); por cada candidata: targetDate < today => report_error 'date_in_past' [DEP D3]; si no, si existe otra tarea del mismo establishmentId con targetDate > la suya y state en WEB_OCCUPYING_STATES => report_error 'later_day_already_published' con blockedBy = id de esa tarea (la de mayor fecha, desempate por id); si no, publish. No muta la entrada; el resultado no depende del orden del array de entrada.

MATRIZ A · computePublishFrom (todas con timeZone Europe/Madrid, eveHour 17:00 salvo que se diga; nombre de test: 'RA-01 · <descripción>'). Notación: now => resultado (UTC); entre corchetes la hora local.
A01 menú para hoy: now 2026-02-10T09:00:00Z [10:00 CET], target 2026-02-10 => at 2026-02-10T09:00:00.000Z, reason today.
A02 hoy, medianoche local: now 2026-02-09T23:00:00Z [00:00 del 10], target 2026-02-10 => at = now (today).
A03 hoy, último milisegundo: now 2026-02-10T22:59:59.999Z [23:59:59.999], target 2026-02-10 => at = now.
A04 mañana pedido a las 10:00: now 2026-02-10T09:00:00Z, target 2026-02-11 => at 2026-02-10T16:00:00.000Z [17:00 CET], reason eve.
A05 mañana pedido a las 18:00: now 2026-02-10T17:00:00Z [18:00], target 2026-02-11 => at 2026-02-10T17:00:00.000Z (= now), reason eve_already_passed.
A06 borde 16:59:59.999: now 2026-02-10T15:59:59.999Z, target 2026-02-11 => at 2026-02-10T16:00:00.000Z, eve.
A07 borde 17:00:00 exacto: now 2026-02-10T16:00:00Z, target 2026-02-11 => at 2026-02-10T16:00:00.000Z (la etiqueta reason es la única convención: eve_already_passed con eve > now estricto).
A08 17:00:00.001: now 2026-02-10T16:00:00.001Z => at = now.
A09 dentro de 3 días: now 2026-02-10T09:00:00Z, target 2026-02-13 => at 2026-02-12T16:00:00.000Z [jueves 17:00].
A10 menú de ayer: now 2026-02-10T09:00:00Z, target 2026-02-09 => err date_in_past.
A11 pedido a las 23:59 para mañana: now 2026-02-10T22:59:00Z [23:59], target 2026-02-11 => at = now (22:59Z), eve_already_passed.
A12 pedido a las 23:59 para hoy: now 2026-02-10T22:59:00Z, target 2026-02-10 => at = now, today.
A13 23:59 en verano: now 2026-06-10T21:59:00Z [23:59 CEST], target 2026-06-11 => at = now.
A14 trampa UTC (verano): now 2026-06-10T22:00:00Z [00:00 del 11], target 2026-06-10 => err date_in_past (en UTC aún sería el 10).
A15 now 2026-06-10T22:30:00Z [00:30 del 11], target 2026-06-10 => err date_in_past.
A16 frontera invierno: now 2026-02-10T23:00:00Z [00:00 del 11], target 2026-02-10 => err date_in_past.
CAMBIO DE HORA DE MARZO (domingo 2026-03-29; a la 01:00Z las 02:00 CET pasan a ser 03:00 CEST):
A17 target domingo 2026-03-29, now 2026-03-27T09:00:00Z => at 2026-03-28T16:00:00.000Z [sábado 17:00 CET]. (Con 'menos 24 h' saldría 15:00Z = 16:00 CET: mal.)
A18 target lunes 2026-03-30, now 2026-03-27T09:00:00Z => at 2026-03-29T15:00:00.000Z [domingo 17:00 CEST]. (Con 'medianoche + 17 h' saldría 16:00Z = 18:00 CEST: mal.)
A19 pedido sábado now 2026-03-28T15:30:00Z [16:30 CET], target 2026-03-30 => at 2026-03-29T15:00:00.000Z, eve.
A20 now 2026-03-29T14:59:00Z [16:59 CEST], target 2026-03-30 => at 2026-03-29T15:00:00.000Z, eve.
A21 now 2026-03-29T15:00:00Z [17:00 CEST], target 2026-03-30 => at = now.
A22 día de 23 h: now 2026-03-29T21:59:00Z [23:59 CEST], target 2026-03-29 => at = now; now 2026-03-29T22:00:00Z [00:00 del 30], target 2026-03-29 => err date_in_past.
A23 'hoy' tras medianoche, antes del hueco: now 2026-03-28T23:30:00Z [00:30 CET del 29], target 2026-03-29 => at = now (en UTC aún sería el 28); mismo now con target 2026-03-28 => err date_in_past.
A24 alrededor del hueco: now 2026-03-29T00:59:59Z [01:59:59 CET] y now 2026-03-29T01:00:00Z [03:00:00 CEST], target 2026-03-29 => at = now en ambos (hoy no cambia).
CAMBIO DE HORA DE OCTUBRE (domingo 2026-10-25; a la 01:00Z las 03:00 CEST pasan a ser 02:00 CET; el día dura 25 h):
A25 target domingo 2026-10-25, now 2026-10-22T08:00:00Z => at 2026-10-24T15:00:00.000Z [sábado 17:00 CEST]. (Con 'menos 24 h' saldría 16:00Z = 18:00 CEST: mal.)
A26 target lunes 2026-10-26, now 2026-10-22T08:00:00Z => at 2026-10-25T16:00:00.000Z [domingo 17:00 CET]. (Con 'medianoche + 17 h' saldría 15:00Z = 16:00 CET: mal.)
A27 now 2026-10-25T15:59:00Z [16:59 CET], target 2026-10-26 => at 2026-10-25T16:00:00.000Z, eve; now 2026-10-25T16:00:00Z => at = now.
A28 día de 25 h: now 2026-10-25T22:30:00Z [23:30 CET], target 2026-10-25 => at = now (un cálculo de '24 h' diría que ya es lunes); now 2026-10-25T23:00:00Z [00:00 del 26], target 2026-10-25 => err date_in_past; now 2026-10-24T22:30:00Z [00:30 CEST del 25], target 2026-10-24 => err date_in_past.
A29 las dos 02:30 del día: now 2026-10-25T00:30:00Z [02:30 CEST] y now 2026-10-25T01:30:00Z [02:30 CET], target 2026-10-25 => at = now en ambos.
CALENDARIO Y CONFIGURACIÓN:
A30 fin de mes, bisiesto y fin de año: now 2026-02-27T09:00:00Z, target 2026-03-01 => at 2026-02-28T16:00:00.000Z; now 2028-02-20T09:00:00Z, target 2028-03-01 => at 2028-02-29T16:00:00.000Z; now 2026-12-20T09:00:00Z, target 2027-01-01 => at 2026-12-31T16:00:00.000Z.
A31 eveHour '20:30': now 2026-02-10T09:00:00Z, target 2026-02-11 => at 2026-02-10T19:30:00.000Z.
A32 eveHour inválida ('25:00', '9:00', '') => err invalid_eve_hour. A33 targetDate '2026-02-30' o '10/02/2026' => err invalid_date. A34 timeZone 'No/Existe' => err invalid_time_zone. A35 now = new Date('x') => err invalid_now.
HORA_VISPERA EN HUECO/REPETICIÓN [DEP D6; valores con semántica PostgreSQL/zonedTimeToUtc]:
A36 eveHour '02:30', now 2026-03-27T09:00:00Z, target 2026-03-30 => at 2026-03-29T01:30:00.000Z [03:30 CEST]; eveHour '02:00' => at 2026-03-29T01:00:00.000Z. (Alternativa localToUtc: err nonexistent_local_time.)
A37 eveHour '02:30', now 2026-10-22T08:00:00Z, target 2026-10-26 => at 2026-10-25T01:30:00.000Z [la segunda 02:30, CET]. (Alternativa localToUtc: 00:30Z, la primera.)
A38 control sin cambio de hora: eveHour '02:30', now 2026-02-09T09:00:00Z, target 2026-02-11 => at 2026-02-10T01:30:00.000Z.
INVARIANTES:
A39 coherencia con SQL [opcional, necesita gemelos TS de corte y publish_by]: para target 2026-03-29, 03-30, 10-25, 10-26 y 02-11 con now muy anterior: at < corte < publish_by con los valores UTC de PostgreSQL de la sección 2 (hechos arriba). Si Bosco no quiere los gemelos en la Fase 1, se deja como test de la Fase 4.
A40 pureza: mismas entradas, misma salida; now no se muta; el resultado no cambia aunque cambie Date.now.

MATRIZ B · orderAndFilter (now 2026-02-10T18:00:00Z [19:00 CET], timeZone Europe/Madrid; restaurantes R1 y R2; createdAt creciente por orden de declaración; nombre: 'RA-01 · <descripción>'). Se anota el 'ids' de salida en orden.
B01 el de hoy llega después de que el de mañana ya se publicó: R1 A{2026-02-11, published}, B{2026-02-10, ready} => [B report_error later_day_already_published blockedBy A]; A no sale.
B02 igual con A en publishing => B bloqueada. B03 igual con A en verifying => B bloqueada. [DEP D4]
B04 dos tareas del mismo restaurante en la misma ejecución: R1 A{02-11, ready}, B{02-10, ready} => [B publish, A publish] en ese orden.
B05 estados que no bloquean: A (R1, 02-11) en waiting, preparing, error, session_blocked, cancelled y returned, uno por caso, con B{02-10, ready} => [B publish] cada vez. [DEP D4 para error tras subida_hecha y para tareas atascadas]
B06 otro restaurante: A{R2, 02-11, published}, B{R1, 02-10, ready} => [B publish].
B07 misma fecha no bloquea (republicación): A{R1, 02-10, published, createdAt anterior}, B{R1, 02-10, ready} => [B publish].
B08 dos ready, mismo restaurante y fecha: ordenadas por createdAt y luego id => [antigua publish, nueva publish]. [DEP D5]
B09 orden global y desempate: ready R1/02-12, R2/02-10, R1/02-11, R2/02-11 (en ese orden de entrada) => ids ordenados R2/02-10, luego R1/02-11 y R2/02-11 por createdAt, luego R1/02-12.
B10 fecha pasada: B{R1, 02-09, ready} sin nada más publicado => [B report_error date_in_past]. [DEP D3]
B11 precedencia: B{R1, 02-09, ready} con A{R1, 02-11, published} => reason date_in_past (no later_day_already_published). [DEP D3]
B12 solo las `ready` generan decisión: tareas en los otros nueve estados no aparecen en la salida.
B13 invariancia: 20 permutaciones de la entrada de B09 dan la misma salida.
B14 no muta: entrada con Object.freeze en cada tarea y en el array; no lanza y el array original conserva su orden.
B15 cambio de hora: now 2026-03-29T22:30:00Z [00:30 CEST del lunes 30], R1 ready 03-29 => date_in_past y R1 ready 03-30 => publish; now 2026-10-25T22:30:00Z [23:30 CET del domingo 25], ready 10-25 => publish; now 2026-10-25T23:00:00Z => date_in_past. [DEP D3]
B16 ready con publishFrom > now no se procesa; publishFrom = now sí. [DEP D10]
B17 lista vacía => []. B18 una tarea published de +3 días también bloquea (cualquier fecha posterior), y una published de la misma fecha no.

PRUEBA EN SECO DE LA FASE 1. agente:seco no tiene tabla de tareas (llega en la Fase 2) y team_menu_queue solo devuelve menús vivos. Propuesta: un adaptador de lectura convierte cada fila de team_menu_queue del restaurante activado en una OrderTask virtual (state 'ready' si computePublishFrom.at <= now, 'waiting' si no), usa spaces.timezone vía space_timezone(), y muestra por menú: acción (publicar ahora / esperar hasta <hora local> / error por fecha pasada / error por día posterior ya publicado) y 'cuándo'. Que cuente o no un menú `published` leído de la tabla menus como 'ya publicado' es la decisión D7. El adaptador no escribe nada y vive en src/services, no en el core.

CITA DE LA REGLA. describe('RA-01 · cuándo publicar y en qué orden', ...) y cada it('RA-01 · <caso>', ...) con el formato de 'RN-RES-01 · ...'. Registrar RA-01..RA-07 en agents/menu-diario/docs/reglas.md (Código | Qué dice | PRD | Test), igual que docs/agents/reglas.md [DEP D8]. Cada caso de la lista de §7.1 queda cubierto así: hoy => A01-A03; mañana a las 10:00 y a las 18:00 => A04-A08; dentro de 3 días => A09; ayer => A10; 23:59 => A11-A16; cambio de hora de octubre y de marzo => A17-A29 y A36-A38; regla de orden (el de hoy llega después del de mañana) => B01-B03; dos tareas del mismo restaurante en la misma ejecución => B04, B07-B09.
```


---

## Anexo B · Alta del usuario agente: scripts propuestos (NO ejecutados)

**Resumen del explorador:** Se puede dar de alta al agente sin tocar ninguna función existente, pero hay tres cosas que Bosco tiene que saber antes. (1) BLOQUEANTE: el espacio demo se resembró el 03/10/2026 a las 13:43 UTC (tras subir las migraciones 169 a 175) y deshizo todo lo hecho en Bar Demo: hoy Bar Demo no tiene plataforma web, dirección, Menú Diario, plantilla ni menús (0 menús; los 2 que hay son de Magariños), así que el requisito R3 ya no se cumple y hay que relanzar agents/menu-diario/sql/bar-demo-pruebas.sql antes de la prueba en seco. Cualquier push a la rama agents que toque supabase/seed/ lo volverá a borrar. (2) El hallazgo C2 se confirma con la definición viva y con números de hoy: con 0 especialidades el agente queda fuera del reparto de MENÚS (menu_candidate_ids) pero entra en el de trabajos (en Bar Demo pasaría de 2 a 3 candidatos) y en el de tareas (de 3 a 4), con carga 0. La única palanca de la Fase 1 sin modificar funciones es worker_availability.available=false: saca al agente de job_candidate_ids (pantalla Asignar, auto_assign_job, assign_job, approve_job_reassignment) y de menu_candidate_ids, pero NO del reparto de tareas, ni del listado de carga del equipo, ni de lo que ve y puede hacer por estar autorizado en el restaurante (finanzas, conversaciones, informes y registrar pagos). (3) Un alta no escribe en audit_log, notifications ni menu_events si se hace con INSERT directo; con set_worker_establishments() deja exactamente 1 apunte de audit_log (membership.establishments_changed), y eso pertenece a la ALTA, no a la prueba en seco. La prueba en seco (inicio de sesión + team_menu_queue, que es STABLE) no escribe en ninguna tabla de public. Credenciales: la cuenta de acceso la crea Bosco en el panel de Supabase con una contraseña que no pasa por el chat; el script SQL solo la busca por correo. No hay segundo factor obligatorio para miembros normales. Esta sesión no tiene ninguna variable AGENTE_, SUPABASE_, RESTAVOR_ ni LANDINGSITE_. El script propuesto se ha validado en un PostgreSQL 16 local desechable con copias literales de las funciones vivas (idempotente, falla con mensaje claro si falta la cuenta o si el agente tiene especialidades); el clúster temporal se borró y git status queda limpio.

**Preguntas que planteó:**
- ¿Confirmas el correo de la cuenta del agente? El script usa menu@restavor.com (el ejemplo del PRD, R4). Importa que NO sea @cuotly.test (el sembrado borra esas cuentas en cada resembrado). ¿Ese buzón existe y quién lo lee? No lo he podido comprobar.
- El resembrado del 03/10 13:43 UTC deshizo Bar Demo (sin plataforma web, dirección, Menú Diario, plantilla ni menús). ¿Me das permiso para relanzar agents/menu-diario/sql/bar-demo-pruebas.sql (los 4 bloques, el mismo alcance de la decisión 154) antes de la prueba en seco? Y como cada push a agents que toque supabase/seed/ lo vuelve a borrar, ¿llevamos Bar Demo y el alta del agente a supabase/seed/ o seguimos a mano?
- ¿Activamos la opción 5 (worker_availability.available=false) en la Fase 1 como puente hasta la marca de la Fase 2? Cierra el reparto de trabajos y da un segundo cierre frente a una especialidad puesta por error, pero NO cubre tareas, el listado de carga ni los permisos por estar autorizado. Mi recomendación: sí, y retirarla cuando exista la marca de la decisión 153.
- ¿Creas tú la cuenta de acceso en el panel de Supabase de Restavor pruebas (Authentication > Users > Add user, Auto Confirm User) con una contraseña de tu gestor, y guardas AGENTE_EMAIL y AGENTE_PASSWORD tanto en el entorno de la nube (para esta sesión, que tendrá que ser nueva) como en los secretos de Actions? Es la vía que he diseñado: la contraseña no pasa por el chat ni por el SQL.
- ¿Te vale que la membresía se cree por INSERT directo (como hace la propia app con un correo ya registrado, sin apunte de auditoría) y que solo la autorización en Bar Demo pase por set_worker_establishments (1 apunte de audit_log, de Elena)? El criterio 'audit_log igual antes y después' se mediría entre B (tras el alta) y C (tras la prueba en seco).
- La decisión 153 habla de excluir al agente de los repartos, pero por estar autorizado también podrá leer finanzas y conversaciones del restaurante, REGISTRAR PAGOS (register_payment lo permite a un worker autorizado) y recibir y preparar informes. En Bar Demo no importa; en la Fase 7 sí. ¿Quieres que el diseño de la Fase 2 cierre también eso (y las tareas y el listado de carga), o lo dejamos aceptado?
- ¿Corrijo el PRD del agente (§3.5, D9, §7.7, §12 y el criterio de la Fase 1) y docs/RECONOCIMIENTO.md (Bar Demo ya no está listo, 175 migraciones), o lo dejamos para la Fase 2? Esta sesión era solo de lectura y no he tocado nada.

**Contradicciones que encontró:**
- PRD agente §3.5 (línea 110), D9 (línea 133) y §7.7 (línea 375): 'el agente no es candidato, así que el reparto normal no cambia'. Es cierto solo para menús; es falso para trabajos y tareas (C2, confirmado hoy: Bar Demo pasa de 2 a 3 candidatos de trabajo y de 3 a 4 de tareas). La decisión 153 ya lo asume, pero el PRD no se ha corregido.
- PRD agente §12 ('no modificar funciones, tablas o políticas existentes') frente a la decisión 153 (excepción puntual autorizada por Bosco para excluir al agente de los repartos). No es un choque con CLAUDE.md, pero PRD §12 y los criterios de la Fase 1 (línea 581) no recogen la excepción.
- Criterio de aceptación de la Fase 1 (PRD línea 581), 'el agente no aparece en menu_candidate_ids de ningún menú': es insuficiente y hoy sería vacuo para Bar Demo (0 menús). No dice nada de job_candidate_ids ni de list_task_candidates, que es donde sí aparece. Se propone completarlo con las comprobaciones 5 a 7 y el límite conocido.
- docs/RECONOCIMIENTO.md (cabecera línea 8, 'Bar Demo está listo'; líneas 33-43 y 350, 168 migraciones y 229 filas) quedó desfasado: el resembrado del 03/10 13:43 UTC lo deshizo (decisión 154 ya avisaba) y hay 175 migraciones y 7 membresías. El informe y la base no coinciden.
- CLAUDE.md ('todo cambio de estado relevante genera un evento y un registro de auditoría') frente a la propia ruta de alta de la app: añadir a un miembro ya registrado es un INSERT directo en space_memberships sin apunte de auditoría (apps/web/src/app/espacios/actions.ts:72-80). Hueco previo de Restavor web, no del PRD del agente; el alta propuesta deja auditoría solo en la autorización de restaurante (set_worker_establishments).
- PRD §11 coloca AGENTE_EMAIL y AGENTE_PASSWORD solo como secretos de GitHub Actions, pero la prueba en seco (npm run agente:seco) se ejecutará desde una sesión en la nube, que necesita las mismas variables en el entorno de la sesión: la contraseña vivirá en dos sitios.
- Decisión 153 describe la marca de la Fase 2 como la solución, mientras que el informe §7 punto 5 opción (i) (disponibilidad = no) era un parche descartado como solución final. Usarlo en la Fase 1 como puente es coherente solo si Bosco lo aprueba expresamente y se retira cuando exista la marca.

**Riesgos:**
- Resembrados: cualquier push a la rama agents que cambie supabase/seed/ borra Bar Demo (ya pasó el 03/10 13:43 UTC) y la membresía y autorizaciones del agente (la cuenta de acceso sobrevive solo si no es @cuotly.test). Hay trabajo de Reservas en curso sobre la misma base, así que puede repetirse; las líneas base A, B y C solo valen si no hay resembrado entre medias.
- El agente entra en el reparto de TAREAS (list_task_candidates, create_job_task) y en la carga del equipo aunque se use available=false; un administrador puede asignarle una tarea a mano por la UI.
- Permisos heredados de estar autorizado en el restaurante: registrar pagos (register_payment, RN-FIN-06), leer finanzas, conversaciones, notas y archivos, y ser destinatario y preparador de informes. En Bar Demo (datos inventados) es aceptable; en la Fase 7 (restaurante real) una filtración de la cuenta del robot permitiría marcar cobros reales como pagados.
- available=false usa la disponibilidad declarada (HU-30) con otro sentido y la Equipo la muestra como 'No disponible' con una nota; solo el propio agente o postgres pueden revertirla. Si se mantiene cuando llegue la marca de la Fase 2, habrá dos mecanismos para lo mismo.
- Si alguien da una especialidad al agente desde Equipo, entra en menu_candidate_ids y en la autoasignación de menús (con available=false sigue fuera, de ahí el doble cierre); el script se niega a dar de alta si ya tiene una viva, y la comprobación 6 lo vigila.
- Credenciales: una contraseña en variables de entorno de la nube es legible por cualquier comando de la sesión (el harness no la imprime, pero existe). Mitigar con contraseña única de uso exclusivo en pruebas, sin reutilizar la de demostración (está en el repo), no registrarla jamás y rotarla al cerrar la fase; la de producción (Fase 7) será otra distinta.
- Inicio de sesión del robot por API no probado: no se ha comprobado la configuración de Auth del proyecto (captcha, límites de inicios de sesión) ni que el correo funcione; con captcha activo un login por contraseña sin token fallaría. El asesor de seguridad marca desactivada la protección contra contraseñas filtradas (irrelevante con una contraseña aleatoria larga).
- La prueba en seco no debe llamar a register_menu_download, mark_menu_published ni report_menu_publication_error (escriben en menu_downloads, audit_log, menu_events y avisos y pueden cambiar el estado del menú); solo team_menu_queue y menu_deadlines son de lectura. Cada comprobación con set_config local necesita ir en una sola llamada para que el actor simulado siga vigente.
- Comprobaciones vacuas: 3, 5, 6 y 7 salen true si la cuenta no existe o no es miembro, y la 5 también si Bar Demo no tiene menús; hay que leer primero 1 y 2 y el detalle de la 5.
- Las 4 cifras de plazas y cobro no aplican hoy (cuotly_plan null en demo y restavor), pero si Restavor web activara un plan con límite de usuarios en el espacio, el agente contaría como 1 usuario interno y podría chocar con guard_cuotly_user_limit al darse de alta o de nuevo tras un resembrado.

**Diseño propuesto:**

```text
PLAN PROPUESTO (nada ejecutado)

Orden:
 0. Bosco confirma las preguntas de abajo (sobre todo correo, relanzar Bar Demo y opción 5).
 1. Línea base A (linea-base.sql, solo lectura).
 2. Bosco crea la cuenta de acceso en Supabase de "Restavor pruebas": Authentication > Users > Add user > Create new user, correo menu@restavor.com, contraseña aleatoria de 32 o más caracteres de su gestor de contraseñas, marcando "Auto Confirm User". Es la misma vía con la que se creó info@ (PRUEBAS.md:130-131); las filas salen válidas para GoTrue sin los trucos del sembrado. La contraseña no pasa por el chat ni aparece en ningún SQL.
 3. Bosco guarda AGENTE_EMAIL y AGENTE_PASSWORD (a) como variables del entorno en la nube de Claude Code (menú del entorno en la barra de título de la sesión > Edit) y abre una sesión nueva, y (b) como secretos de repositorio de GitHub Actions (PRD §11) para el workflow de la Fase 1. Nunca por el chat. Verificar solo con [ -n "$AGENTE_PASSWORD" ] && echo definida, sin imprimirla. El robot la lee de process.env y no la registra en logs. Contraseña única (no la de demostración <contraseña de demostración>, que está en el repo) y a rotar al cerrar la Fase 1; en la Fase 7 será otra cuenta y otra contraseña en producción.
 4. (Con permiso de Bosco) relanzar agents/menu-diario/sql/bar-demo-pruebas.sql, los 4 bloques, para recuperar plataforma, Menú Diario, plantilla y menú de Bar Demo. Deja unos 8 apuntes de audit_log (7 + establishment.data_changed) y 1 evento de menú: es de Bar Demo, no del agente, y va ANTES de la línea base B.
 5. Ejecutar el alta (script 1). Después línea base B y las comprobaciones (script 2).
 6. Prueba en seco (Fase 1) solo con inicio de sesión + team_menu_queue + menu_deadlines. Línea base C. Criterio: B = C.
 7. Si hay un push a agents que toque supabase/seed/ entre medias, hay que repetir 4 y 5 (el alta es idempotente) y volver a medir A, B y C.
 Recomendación sobre la opción 5 (available=false): activarla en la Fase 1 como puente barato y reversible (cierra el reparto de trabajos y añade un segundo cierre frente a una especialidad puesta por error), dejando por escrito que NO cubre tareas, listado de carga ni permisos por autorización, y retirándola cuando la Fase 2 traiga la marca de la decisión 153.

=== SCRIPT 1 · alta-agente.sql (validado en local; solo Restavor pruebas; un único bloque, una transacción) ===
-- ALTA del usuario agente del Agente Menú Diario · Fase 1 · PROPUESTA (NO EJECUTADA)
-- SOLO "Restavor pruebas" (bnucqykimngjwcrlpmsm). NUNCA producción ("Cuotly", mcajbfxhkxtdhjoyrqha).
-- Idempotente. Hay que repetirlo tras cada resembrado del espacio demo.
-- NO crea la cuenta de acceso (auth.users / auth.identities) ni toca su contraseña: la crea Bosco en
-- Supabase > Authentication > Users > Add user (Create new user, Auto Confirm User).
-- LIMITES DE LA OPCION 5 (worker_availability.available = false):
--   Lo saca de job_candidate_ids (list_job_candidates, auto_assign_job, assign_job, approve_job_reassignment) y de menu_candidate_ids.
--   NO lo saca de list_task_candidates / create_job_task, space_team_load, ni de lo que ve y puede hacer por estar autorizado
--   en Bar Demo (finanzas, conversaciones, notas, archivos, register_payment, informes).
do $$
declare
  c_email   constant text    := 'menu@restavor.com';  -- decisión 157 (Bosco, 03/10/2026)
  c_name    constant text    := 'Agente Menú Diario';
  c_space   constant uuid    := 'd1000000-0000-0000-0000-000000000001'; -- espacio demo
  c_est     constant uuid    := 'd4000000-0000-0000-0000-000000000001'; -- Bar Demo
  c_elena   constant uuid    := 'd0000000-0000-0000-0000-000000000001'; -- owner@cuotly.test (administradora, assign_jobs)
  c_marcar_no_disponible constant boolean := true;               -- opcion 5; false si Bosco no la quiere
  c_nota    constant text    := 'Agente automatico: no recibe repartos de trabajos (decision 153)';
  v_agent   uuid;
  v_role    public.space_role;
  v_status  public.member_status;
  v_otros   integer;
  v_espec   integer;
begin
  -- 1. Guardas de entorno
  if not exists (select 1 from public.spaces where id = c_space and slug = 'demo') then
    raise exception 'El espacio demo (%) no existe: no se toca nada', c_space;
  end if;
  if not exists (select 1 from public.establishments where id = c_est and space_id = c_space and name = 'Bar Demo') then
    raise exception 'Bar Demo (%) no esta en el espacio demo: no se toca nada', c_est;
  end if;
  -- 2. La cuenta de acceso la crea Bosco antes; aqui solo se comprueba
  select u.id into v_agent from auth.users u where lower(u.email) = lower(c_email);
  if v_agent is null then
    raise exception 'La cuenta % no existe. Crearla antes en Supabase (Authentication > Users > Add user, con Auto Confirm User)', c_email;
  end if;
  if not exists (select 1 from auth.users u where u.id = v_agent and u.email_confirmed_at is not null) then
    raise exception 'La cuenta % no esta confirmada (marcar Auto Confirm User)', c_email;
  end if;
  if not exists (select 1 from auth.identities i where i.user_id = v_agent and i.provider = 'email') then
    raise exception 'La cuenta % no tiene identidad de correo', c_email;
  end if;
  -- 3. Solo de este espacio
  select count(*) into v_otros from public.space_memberships sm where sm.user_id = v_agent and sm.space_id <> c_space;
  if v_otros > 0 then
    raise exception 'La cuenta % ya es miembro de otro espacio: no se toca nada', c_email;
  end if;
  -- 4. Nombre visible
  update public.profiles set full_name = c_name where id = v_agent and full_name is distinct from c_name;
  -- 5. Miembro activo, rol worker (si existe con otro rol o estado, se para; can_perform_jobs=false no afecta a un worker)
  select sm.role, sm.status into v_role, v_status
    from public.space_memberships sm where sm.space_id = c_space and sm.user_id = v_agent;
  if not found then
    insert into public.space_memberships (space_id, user_id, role, status, can_perform_jobs)
    values (c_space, v_agent, 'worker', 'active', false);
  elsif v_role <> 'worker' or v_status <> 'active' then
    raise exception 'El agente ya es miembro con rol % y estado %: se esperaba worker/active. No se sobrescribe', v_role, v_status;
  end if;
  -- 6. SIN especialidades: no se crea ninguna y se exige que no tenga ninguna viva
  select count(*) into v_espec from public.worker_specialties ws
   where ws.space_id = c_space and ws.user_id = v_agent and ws.revoked_at is null;
  if v_espec > 0 then
    raise exception 'El agente tiene % especialidad(es) viva(s): entraria en el reparto de menus. Retirarlas antes', v_espec;
  end if;
  -- 7. [OPCIONAL] No disponible. Solo el propio agente (o postgres) puede revertirlo (politica UPDATE user_id = auth.uid())
  if c_marcar_no_disponible then
    insert into public.worker_availability (space_id, user_id, available, note)
    values (c_space, v_agent, false, c_nota)
    on conflict (space_id, user_id) do update
      set available = false, note = excluded.note, updated_at = now()
      where public.worker_availability.available is distinct from false
         or public.worker_availability.note is distinct from excluded.note;
  end if;
  -- 8. Autorizado SOLO en Bar Demo con la funcion de la app, actuando como Elena (tiene assign_jobs).
  --    set_worker_establishments REEMPLAZA el conjunto ({Bar Demo}) y solo audita si cambia algo.
  perform set_config('request.jwt.claims', json_build_object('sub', c_elena, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub',  c_elena::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if auth.uid() is distinct from c_elena or not public.has_capability(c_space, 'assign_jobs') then
    raise exception 'No se pudo actuar como Elena con assign_jobs';
  end if;
  perform public.set_worker_establishments(c_space, v_agent, array[c_est]);
  raise notice 'Agente % dado de alta: worker activo, sin especialidades, autorizado solo en Bar Demo', v_agent;
end
$$;
-- NOTA SOBRE RESEMBRADOS: el sembrado borra public.spaces del demo (y en cascada membresias y worker_*), pero solo borra de
-- auth.users los '%@cuotly.test'. Con un correo @restavor.com la cuenta y su perfil sobreviven: basta relanzar este script.
-- Con @cuotly.test la cuenta desapareceria y habria que recrearla y cambiar su contrasena.

=== SCRIPT 2 · verificaciones.sql (SOLO LECTURA; ejecutar como postgres, cada bloque en UNA sola llamada para que set_config local siga vigente) ===
with a as (select id from auth.users where lower(email) = lower('menu@restavor.com')),
     params as (select 'd1000000-0000-0000-0000-000000000001'::uuid sp, 'd4000000-0000-0000-0000-000000000001'::uuid est),
r as (
  select 1 n, 'cuenta confirmada, con identidad email y sin segundo factor' crit,
         exists (select 1 from auth.users u join a on a.id = u.id where u.email_confirmed_at is not null)
         and exists (select 1 from auth.identities i join a on a.id = i.user_id where i.provider = 'email')
         and not exists (select 1 from auth.mfa_factors f join a on a.id = f.user_id) ok,
         (select u.email from auth.users u join a on a.id = u.id) detalle
  union all
  select 2, 'miembro activo, rol worker, solo en el espacio demo, sin marcas de administrador',
         (select count(*) = 1 from public.space_memberships sm join a on a.id = sm.user_id)
         and exists (select 1 from public.space_memberships sm join a on a.id = sm.user_id, params p
                      where sm.space_id = p.sp and sm.role = 'worker' and sm.status = 'active'
                        and not sm.can_approve_reports and not sm.can_support_reservations),
         (select string_agg(sm.role::text || '/' || sm.status::text, ',') from public.space_memberships sm join a on a.id = sm.user_id)
  union all
  select 3, 'trabajador SIN especialidades (0 filas en worker_specialties, ni revocadas)',
         not exists (select 1 from public.worker_specialties ws join a on a.id = ws.user_id),
         (select count(*)::text || ' filas' from public.worker_specialties ws join a on a.id = ws.user_id)
  union all
  select 4, 'autorizado en Bar Demo y solo en Bar Demo',
         (select coalesce(array_agg(we.establishment_id), '{}') from public.worker_establishments we join a on a.id = we.user_id
           where we.revoked_at is null) = (select array[p.est] from params p)
         and exists (select 1 from a, params p where public.is_authorized_for_establishment(p.est, a.id)),
         (select string_agg(e.name, ',') from public.worker_establishments we join a on a.id = we.user_id
            join public.establishments e on e.id = we.establishment_id where we.revoked_at is null)
  union all
  select 5, 'no aparece en menu_candidate_ids de ningun menu',
         not exists (select 1 from public.menus m cross join lateral public.menu_candidate_ids(m.id) c(uid) join a on a.id = c.uid),
         (select count(*)::text || ' menus examinados (' || count(*) filter (where e.name = 'Bar Demo')::text || ' de Bar Demo)'
            from public.menus m join public.establishments e on e.id = m.establishment_id)
  union all
  select 6, 'estructural: sin especialidad viva general ni daily_menu (la condicion de menu_candidate_ids)',
         not exists (select 1 from public.worker_specialties ws join a on a.id = ws.user_id
                      where ws.revoked_at is null and ws.specialty in ('general', 'daily_menu')),
         null
  union all
  select 7, 'con la opcion 5: no aparece en job_candidate_ids de ningun trabajo (sin opcion 5 saldra false)',
         not exists (select 1 from public.jobs j cross join lateral public.job_candidate_ids(j.id) c(uid) join a on a.id = c.uid),
         (select count(*)::text || ' trabajos examinados' from public.jobs)
)
select n, crit as criterio, ok, detalle from r order by n;
-- OJO: 3, 5, 6 y 7 salen true de forma vacua si la cuenta no existe o no es miembro; leer primero 1 y 2. Si el detalle de 5 dice 0 de Bar Demo, repetir tras bar-demo-pruebas.sql.

-- 8. Lo que el robot necesita en la prueba en seco, con SU sesion simulada (debe dar t, t, t). Una sola llamada.
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where lower(email) = lower('menu@restavor.com')), 'role', 'authenticated')::text, true) as actuando_como_el_agente;
select public.is_space_member('d1000000-0000-0000-0000-000000000001') as es_del_equipo,
       public.is_authorized_worker_establishment('d4000000-0000-0000-0000-000000000001') as autorizado_en_bar_demo,
       public.can_read_menu_establishment('d4000000-0000-0000-0000-000000000001') as puede_leer_menus_de_bar_demo;

-- LIMITE CONOCIDO (debe salir MAYOR QUE CERO hasta que exista la marca de la Fase 2): trabajos donde el reparto de TAREAS ofrece al agente. Una sola llamada.
select set_config('request.jwt.claims', json_build_object('sub', 'd0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true) as actuando_como_elena;
select count(*) as trabajos_donde_el_agente_sale_en_list_task_candidates
from public.jobs j cross join lateral public.list_task_candidates(j.id) c
where c.worker_id = (select id from auth.users where lower(email) = lower('menu@restavor.com'));

=== SCRIPT 3 · linea-base.sql (SOLO LECTURA; ejecutar en A, B y C; criterio B = C; A -> B es el coste del alta: profiles, space_memberships, worker_availability, worker_establishments y audit_log +1 cada uno la primera vez) ===
select t, n from (
  select 1 o, 'audit_log' t, count(*) n from public.audit_log
  union all select 2, 'audit_log del actor agente (debe ser 0 siempre)', count(*) from public.audit_log where actor_id = (select id from auth.users where lower(email) = lower('menu@restavor.com'))
  union all select 3, 'notifications', count(*) from public.notifications
  union all select 4, 'notification_deliveries', count(*) from public.notification_deliveries
  union all select 5, 'menu_events', count(*) from public.menu_events
  union all select 6, 'menus', count(*) from public.menus
  union all select 7, 'menu_publications', count(*) from public.menu_publications
  union all select 8, 'menu_versions', count(*) from public.menu_versions
  union all select 9, 'menu_downloads', count(*) from public.menu_downloads
  union all select 10, 'state_events', count(*) from public.state_events
  union all select 11, 'timer_events', count(*) from public.timer_events
  union all select 12, 'space_memberships', count(*) from public.space_memberships
  union all select 13, 'worker_establishments', count(*) from public.worker_establishments
  union all select 14, 'worker_specialties', count(*) from public.worker_specialties
  union all select 15, 'worker_availability', count(*) from public.worker_availability
  union all select 16, 'profiles', count(*) from public.profiles
  union all select 17, 'auth.users', count(*) from auth.users
  union all select 18, 'auth.identities', count(*) from auth.identities
  union all select 19, 'auth.sessions (el inicio de sesion suma 1: esquema auth, no cuenta)', count(*) from auth.sessions
  union all select 20, 'auth.refresh_tokens (idem)', count(*) from auth.refresh_tokens
) x order by o;
-- Valores de A medidos hoy (con el agente ausente): 229, 0, 166, 140, 5, 2, 1, 2, 0, 52, 97, 7, 4, 2, 2, 16, 16, 16, 0, 0.

Alternativa NO recomendada para crear la cuenta por SQL: INSERT en auth.users con un hash bcrypt (coste 10) calculado fuera de la sesion y los cuatro tokens a cadena vacia, como el sembrado. Evita que la contraseña aparezca en claro, pero obliga a generar y custodiar el hash fuera, y a replicar a mano las filas de GoTrue; la vía del panel es más simple y más segura.
```


---

## Anexo C · Prueba en seco (`agente:seco`)

**Resumen del explorador:** Se puede hacer la prueba en seco con SOLO lectura y con solo cuatro cosas: iniciar sesión, leer `team_menu_queue`, leer unas pocas columnas de `menus`, `establishments`, `spaces` y `worker_establishments`, y (opcional) llamar a `menu_deadlines`. Las dos RPC son STABLE y toda la cadena de funciones que usan también (comprobado en vivo con pg_get_functiondef). Todos los datos que necesita `calcularPublicarDesde` están al alcance del agente, con tres matices: (1) la zona horaria no sale de la cola, hay que leerla de `spaces.timezone`; (2) la cola solo trae menús VIVOS, no los borradores; (3) el agente NO puede leer `menu_publications` mientras la publicación no esté asignada a él (la política RLS solo deja ver las propias), así que `requested_at` y `publication_id` salen de la cola. Iniciar sesión solo escribe en el esquema `auth`: no hay disparadores ni hooks hacia `public`, y no exige aal2 (solo lo exigen las funciones de plataforma y los datos de comensales de Reservas). Recomiendo derivar los "restaurantes activados" de los datos (autorizado + landing_site + servicio en marcha) con un filtro opcional `--restaurante` que solo restringe. Para garantizar que no escribe: un cliente de solo lectura con tres capas (lista cerrada de tablas, columnas y RPC; `fetch` que solo deja pasar GET a /rest/v1 y los dos POST de autenticación; ESLint que prohíbe `.insert/.update/.delete/.upsert`), más tests con un `fetch` falso y una comprobación externa de recuentos con una conexión privilegiada. HALLAZGO IMPORTANTE: la base se ha resembrado hoy a las 13:43:53 UTC y la premisa de la demostración ya no es cierta: Bar Demo vuelve a tener `web_platform` y `website_url` nulos, sin plantilla, sin menús y SIN Menú Diario contratado. Los dos únicos menús de la base son de Magariños (04/10 en `pending_assignment` con publicación viva, 05/10 en borrador). Además el usuario agente todavía no existe (se da de alta en esta fase), así que NO he podido probar un inicio de sesión real: las lecturas las simulé con SET ROLE authenticated en una transacción de solo lectura con rollback, usando a un trabajador humano autorizado en Magariños; tras ello `audit_log` sigue en 229 filas y `notifications` en 166, como antes.

**Preguntas que planteó:**
- La base de pruebas se resembró hoy y Bar Demo volvió a estar vacío (sin LandingSite, sin plantilla, sin menú y sin Menú Diario). ¿Quieres que, cuando toque demostrar la prueba en seco, se repita el script `agents/menu-diario/sql/bar-demo-pruebas.sql` (incluye contratar Menú Diario con su pago de demostración)? ¿Vale el permiso del 03/10 o lo renuevas? Sin eso, con el agente autorizado solo en Bar Demo, la prueba en seco saldría vacía.
- Si pedimos la publicación del menú de Bar Demo, el sistema se la asigna sola a trabajadora@cuotly.test (es la única candidata humana autorizada ahí) y avisa a propietario y administradores. ¿Te vale así (se vería 'asignada automáticamente a una persona, la reasignaría') o prefieres marcarla como no disponible para que quede 'sin asignar'? Lo decides tú; yo no lo toco.
- Restaurantes activados en la Fase 1: ¿apruebas derivarlos de los datos (agente autorizado + LandingSite + no eliminado) con un filtro `--restaurante` que solo restringe, en vez de un fichero de configuración? ¿Confirmas que el agente NO se autoriza en Magariños (web real) aunque sea el único con menús hoy?
- ¿Te parece bien un parámetro `--ahora=<fecha-hora>` de reloj simulado en la prueba en seco (con un cartel 'RELOJ SIMULADO' bien visible) para poder enseñar con un solo menú los casos hoy/mañana/3 días/ayer? No escribe nada, pero la decisión 151 dice 'no se simula'. Si prefieres que no, esos casos solo se demostrarían con tests unitarios.
- Regla de orden (PRD 7.1): '…otra tarea con target_date posterior ya publicada o en curso'. En la Fase 1 no hay tareas, solo menús. ¿Debe bloquear también un menú de un día posterior que ya esté `published` en Restavor web porque lo publicó una PERSONA, o solo las tareas del propio agente?
- El PRD 7.2 no dice qué hacer con un menú vivo en `publication_requested` ni en `publication_error` asignado a una persona. En la prueba en seco los muestro como 'sin regla: no actúa'. ¿Es lo que quieres o hay una regla?
- ¿Quieres que la prueba en seco imprima también la línea de asignación (qué haría el despachador de la Fase 2 según PRD 7.2) y el supuesto de modo `aprobacion` por defecto, o solo publicar_desde y orden? Mi propuesta es imprimir la asignación como informativa y no imprimir el modo (no existe hasta la Fase 2).
- ¿Aceptas añadir un test SQL nuevo (`supabase/tests/agente_menu_seco.sql`, sin migración) que fije que `team_menu_queue`, `menu_deadlines` y su cadena son STABLE? Es la garantía de que un cambio futuro a VOLATILE hace saltar la alarma antes de que la prueba en seco pueda escribir.

**Contradicciones que encontró:**
- PRD §14 Fase 1 'npm run agente:seco: lee la cola y muestra para cada menú qué haría' vs la realidad de la cola: `team_menu_queue` solo devuelve menús VIVOS (no borradores ni 'prepared'). Un menú en borrador, como el que se creía tener en Bar Demo, nunca saldría por la cola; hay que leer `menus` directamente para mostrarlo (el agente sí puede).
- PRD §3.3 lista `menu_publications` (assigned_to, assignment_mode, requested_version_id) como dato que usa el agente, pero su política RLS (`manage_requests` O `assigned_to = auth.uid()`) solo deja ver al agente las publicaciones YA asignadas a él: en la Fase 1 no ve ninguna. Lo único que ve de las ajenas es lo que trae la cola (requested_at, publication_id, is_assigned, assignment_mode; assigned_to solo si es suyo). Refuerza C10 del RECONOCIMIENTO.
- PRD §14 Fase 1 'El agente no aparece en `menu_candidate_ids`' y 'audit_log tiene el mismo número de filas': el agente no puede comprobar ninguna de las dos (menu_candidate_ids está revocada a authenticated y audit_log solo le deja ver 181 de 229 filas), y el PRD §5.2/§11 prohíbe que el robot tenga `service_role`. Las dos comprobaciones las tiene que hacer una conexión privilegiada externa al robot, no `agente:seco`.
- La premisa del encargo ('en Bar Demo ya hay un menú daily del 04/10/2026 en borrador, sin publicación') y el estado que da por cerrado RECONOCIMIENTO.md ('Bar Demo está listo') ya no coinciden con la base: el resembrado del 03/10 13:43 UTC la deshizo. Hoy Bar Demo no tiene web_platform, URL, plantilla, menú ni Menú Diario; el menú del 04/10 que existe es el de Magariños y está en `pending_assignment` con publicación viva, y el borrador es el del 05/10.
- PRD §3.4 dice que el robot usa `menu_deadlines` y `team_menu_queue` como si fueran suficientes para decidir; pero las comprobaciones previas del PRD §6.2-6 (servicio en marcha 'con la misma lógica que assert_establishment_service_running') no se pueden llamar (solo service_role): hay que replicar la lista de estados de `establishments.status`. Ya apuntado en RECONOCIMIENTO §2.6; sigue aplicando.
- Posible tensión con CLAUDE.md: la decisión 151 dice del Agente Menú Diario 'no se simula (lo que haga es real)'. Un modo `--ahora` (reloj simulado) y la prueba en seco en sí no simulan un agente en pantallas de producción, y la prueba en seco está pedida expresamente por el PRD §14, pero el reloj simulado no está en el PRD: lo trato como pregunta para Bosco, no como decidido. Ninguna otra contradicción directa con CLAUDE.md encontrada para esta fase (el esquema `agente_menu` sin políticas ya está anotado como C3 y es de la Fase 2).
- PRD §7.2 no cubre todos los estados que puede tener un menú vivo asignado a una persona: no dice qué hacer con `publication_requested` (estado transitorio) ni con `publication_error` asignado a una persona; solo habla de pending_assignment, assigned auto/manual, y 'trabajo empezado' (reviewing, ready_to_publish, needs_information). Para no inventar, la prueba en seco los imprimiría como 'sin regla: no actúa'.

**Riesgos:**
- No he podido probar un inicio de sesión real del agente: no existe todavía (se da de alta en esta fase) y en el entorno no hay variables RESTAVOR_SUPABASE_* ni AGENTE_* (solo ANTHROPIC_BASE_URL y GITHUB_TOKEN entre las que miré, por nombre). Toda la lectura la simulé con SET ROLE authenticated y request.jwt.claims de un trabajador humano autorizado en EST-0003, en transacción de solo lectura con rollback. Es equivalente para las políticas de lectura (ninguna mira especialidades), pero el agente real estará autorizado en otro restaurante y tendrá 0 especialidades. Qué hace Auth al iniciar sesión (qué filas escribe en `auth`) NO está comprobado en vivo.
- La afirmación de que PostgREST ejecuta un GET a una RPC STABLE como solo lectura y rechaza (405) un GET a una VOLATILE la hago de memoria de su documentación; no la he comprobado contra esta base. El diseño no depende de ella: la garantía fuerte es el `fetch` restringido más la lista cerrada, y la volatilidad se fija con un test SQL.
- 'STABLE' no garantiza por sí solo que no escriba (una STABLE puede llamar por SELECT a una VOLATILE). Comprobé la cadena a día de hoy (12 funciones auxiliares, todas STABLE y de solo lectura), pero cualquier migración futura puede cambiarla; por eso propongo el test SQL de volatilidad.
- El agente, por ser trabajador autorizado en un restaurante, puede leer por RLS mucho más de lo que necesita: todos los restaurantes del espacio con sus datos fiscales y de contacto (`establishments`, 15 filas), los correos de todo el equipo (`profiles`), las autorizaciones y especialidades del resto de trabajadores, y finanzas e informes de sus restaurantes (ya anotado en RECONOCIMIENTO §2.8). La seguridad aquí es de aplicación (lista cerrada de tablas y columnas y no imprimir datos ajenos), no de base; los logs de Actions se guardan 14 días.
- El agente de la Fase 1, aunque no entre en `menu_candidate_ids`, sí entra en el reparto de trabajos y tareas de los restaurantes donde se le autorice (RECONOCIMIENTO §2.8 / C2; decisión 153 lo resolverá en la Fase 2). Al darlo de alta en Bar Demo ya puede aparecer el primero en la pantalla 'Asignar' de ese restaurante.
- Con el reloj simulado `--ahora`, un fallo de zona horaria podría pasar desapercibido si solo se prueba con datos de hoy. Mitigación: tests de cambio de hora (25/10/2026 y 28/03/2027), contraste del `publish_by_at` calculado contra el del servidor y la hora siempre impresa en local y UTC. El reloj del robot (GitHub Actions, UTC) puede además diferir unos segundos del de la base: despreciable para 'publicar_desde' a 17:00, pero el robot no puede pedir la hora a la base sin una RPC nueva.
- Autorizar al agente en Magariños (web real, 'no usar') o dar de alta menús en Bar Demo son escrituras y decisiones de Bosco; si se hace sin avisar contaminaría datos de un cliente real o dispararía avisos y asignaciones automáticas. La prueba en seco en sí no toca ninguna web (no hace peticiones a landingsite.ai ni a restavor.com).
- `agents/` no está en `pnpm-workspace.yaml`, así que `pnpm lint`/`pnpm typecheck`/`pnpm test` de CLAUDE.md no lo ejecutarían (riesgo ya anotado en RECONOCIMIENTO §6). Hay que decidir si se añade al workspace o se corre aparte en CI.
- Un resembrado de la base (como el de hoy) cambia los datos de menús y las fechas relativas (`current_date + 1/+2`) sin avisar: cualquier demostración o captura de la prueba en seco debe llevar la hora de la consulta y no darse por reproducible.

**Diseño propuesto:**

```text
ESTRUCTURA (todo dentro de `agents/menu-diario/`, nada en `apps/web`, ninguna migración nueva en la Fase 1 salvo, si Bosco quiere, el test SQL de volatilidad):
- `src/core/publicar-desde.ts`: `calcularPublicarDesde({ targetDate, ahora, zonaHoraria, horaVispera = '17:00' })` pura, sin red. Devuelve `{ caso: 'pasada' | 'hoy' | 'vispera_pendiente' | 'vispera_pasada', publicarDesde: Date | null }`; null solo en 'pasada' (el motivo es 'La fecha del menú ya ha pasado'). Usa `zonedTimeToUtc` (copiado o importado de apps/web/src/core/business-clock.ts). `hoy` = fecha local en la zona del espacio.
- `src/core/ordenar-y-filtrar.ts`: `ordenarYFiltrar(tareas, publicadosPosteriores)` pura: orden por target_date asc (desempate requested_at, menu_id), una tarea se bloquea si el mismo restaurante tiene un menú con target_date posterior ya publicado; devuelve cada tarea con su `orden n de N` y la razón de bloqueo.
- `src/core/decidir-seco.ts`: junta lo anterior con las comprobaciones de PRD 6.2-6 que se pueden hacer en seco (kind daily, estado del restaurante, asignación según la tabla de PRD 7.2) y devuelve el código de acción y el motivo.
- `src/db/cliente-solo-lectura.ts` (única importadora de `@supabase/supabase-js`): fábrica con `global.fetch` restringido (solo GET /rest/v1/<tabla|rpc de lista> + POST /auth/v1/token?grant_type=password + POST /auth/v1/logout), listas cerradas `TABLAS_LECTURA` (con columnas) y `RPC_LECTURA = ['team_menu_queue','menu_deadlines']`, `rpc(..., { get: true })`, `persistSession:false, autoRefreshToken:false`. Lee `RESTAVOR_SUPABASE_URL`, `RESTAVOR_SUPABASE_ANON_KEY`, `AGENTE_EMAIL`, `AGENTE_PASSWORD` (nombres del PRD §11; nunca se imprimen valores). Se niega a arrancar si la URL no contiene `bnucqykimngjwcrlpmsm` o contiene `mcajbfxhkxtdhjoyrqha`.
- `src/seco/ejecutar-seco.ts`: 1) iniciar sesión; 2) leer `spaces(id,slug,timezone)`; 3) leer `establishments(id,space_id,code,name,status,web_platform,website_url,permanently_deleted_at)` y `worker_establishments(establishment_id,revoked_at)` con user_id propio; 4) restaurantes activados = autorizado ∧ landing_site ∧ no eliminado (+ `--restaurante` restrictivo); 5) por espacio, `team_menu_queue`; 6) `menus(...)` de los restaurantes activados para borradores/preparados y para los 'publicados posteriores'; 7) contraste: `menu_deadlines` (opcional) y `publish_by_at` recalculado; 8) decidir, ordenar, imprimir; 9) cerrar sesión con el POST de logout. Código de salida 0 si todo bien, distinto de 0 si algo no se pudo leer (distinguir 'error de lectura' de 'cola vacía').
- `src/seco/imprimir.ts`: formato de texto plano para Bosco (lenguaje sencillo), sin datos de clientes más allá del nombre y código del restaurante.

SALIDA (ilustrativa, calculada con datos reales de hoy como si el agente estuviera autorizado en Magariños, reloj 03/10/2026 18:18 Madrid; NO es una ejecución real):
```
AGENTE MENÚ DIARIO · PRUEBA EN SECO · no escribe nada
Entorno: Restavor pruebas (bnucqyki…) · Reloj REAL: 03/10/2026 18:18 (Europe/Madrid)
RESTAURANTES  Magariños (EST-0003): activado a efectos de prueba (autorizado, LandingSite, servicio active)
COLA
  1 · Magariños · Menú del día (a09ea29a) · daily · 04/10/2026 (mañana) · estado pending_assignment
      Pedida: 03/10 15:43 · Plazo objetivo: 04/10 08:00 · Asignación hoy: sin asignar → la tomaría (Fase 2)
      Si fuera suyo: PUBLICAR_YA · publicar_desde 03/10 18:18 (la víspera 03/10 17:00 ya pasó) · orden 1 de 1
SIN PUBLICACIÓN PEDIDA  Magariños · 05/10/2026 · draft → no actúa (aún no se ha pedido publicar)
RESUMEN  PUBLICAR_YA 1 · NO_ACTUAR 1 · Escrituras: 0
```

TABLA DE ASIGNACIÓN QUE IMPRIME (solo informativa, copia PRD 7.2 con los campos de la cola): pending_assignment sin asignar → 'la tomaría'; assigned con assignment_mode auto a otra persona → 'la reasignaría'; assignment_mode manual, o reviewing/ready_to_publish/needs_information con persona → 'no la toca'; asignada al agente (assigned_to = uid) → 'ya es suya'; publication_requested o publication_error con persona → 'sin regla (pregunta abierta)'.

ARCHIVOS Y TESTS: `src/core/publicar-desde.test.ts` (PRD 7.1: hoy, mañana pedido a las 10:00 y 18:00, dentro de 3 días, ayer, 23:59, cambio de hora de octubre 25/10/2026 y de marzo 28/03/2027), `src/core/ordenar-y-filtrar.test.ts` (el de hoy llega tras publicar el de mañana; dos tareas del mismo restaurante), `src/db/cliente-solo-lectura.test.ts` (los 8 tests de la capa de no-escritura), `src/seco/ejecutar-seco.test.ts` con `fetch` falso y datos simulados (es donde se cubren los casos que no se pueden demostrar con la base), y `supabase/tests/agente_menu_seco.sql` (volatilidad de las 14 funciones). Nombres de test citando RA-01 / RA-07. La prueba externa de la Fase 1 (conexión privilegiada): recuento de todas las tablas de `public` antes y después con `select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`, más `auth.sessions` y `auth.refresh_tokens` (esperado +1/+1), más comprobar que el agente no sale en `menu_candidate_ids(m.id)` para ningún menú y que `auth.mfa_factors` del agente es 0.
```


---

## Anexo D · Workflow de comprobación de sesión

**Resumen del explorador:** Esto es solo diseño. No he construido nada, no he escrito en el repositorio ni en GitHub, no he lanzado ningún workflow y no he hecho ninguna petición a landingsite.ai ni a restavor.com.

Lo más importante:
1. El repositorio Restavor/Cuotly es PÚBLICO, no privado como pide el PRD (R2). Lo comprobé con la API de GitHub sin credenciales ("private": false, "visibility": "public"). Consecuencias: los registros de las ejecuciones se pueden leer sin permiso y los artefactos los descarga cualquier cuenta de GitHub. Por eso la sesión solo puede vivir en un secreto de Actions, y el workflow no puede dejar nada sensible en logs ni artefactos. A cambio, el uso de Actions sale gratis hoy (la ejecución 450 de CI factura 0 ms).
2. La rama por defecto es `claude/cuotly-build-from-scratch-okynpm` (último commit 24/09/2026, solo tiene un ci.yml antiguo). Un `schedule` NO corre desde `claude/gallant-mccarthy-nrf8u4`. Sí hay precedente de `workflow_dispatch` desde una rama que no es la de por defecto: la ejecución 12 de "Pruebas · Supabase", rama `agents`.
3. En el entorno de la nube no existe ninguna variable de LandingSite, sesión, agente ni Resend, ni ANTHROPIC_API_KEY. Solo hay ANTHROPIC_BASE_URL y GITHUB_TOKEN. Los secretos de Actions no se pueden ver desde aquí. El único conocido por los archivos es PRUEBAS_DATABASE_URL.
4. Recomendación para guardar la sesión en la Fase 1: un secreto de GitHub Actions (opción a). Se mide con una comprobación de solo lectura cada 4 horas (12 en 48 h, unos 24 a 36 minutos de Actions). El inicio de sesión con contraseña se prueba aparte, en otro trabajo que se lanza a mano, con un solo intento y con tu aprobación.
5. No se puede cerrar en la sesión: el informe de cuánto dura la sesión (hay que esperar 48 horas reales) y la segunda muestra del inicio de sesión desde Actions. Sí se puede hacer en la sesión: el código, sus tests, el primer disparo manual y el resto de criterios de la Fase 1.

**Preguntas que planteó:**
- El repositorio Restavor/Cuotly es PÚBLICO (el PRD R2 pide privado). ¿Es intencionado? Hasta que respondas, el diseño asume público: la sesión solo en un secreto, nada de capturas ni de artefactos con datos sensibles. Si lo pasas a privado, ¿limitamos el ci.yml (hoy ~14 min facturables por push) o aceptas pagar minutos?
- ¿Autorizas subir a la rama por defecto `claude/cuotly-build-from-scratch-okynpm` UN solo archivo de workflow (con el efecto de un despliegue de producción de cuotly-movil, que solo redirige, y una ejecución del ci.yml antiguo)? Si no, la alternativa es una tarea programada de esta plataforma que lance el workflow cada pocas horas (más cara y menos fiable).
- ¿Autorizas expresamente la prueba del inicio de sesión con contraseña desde GitHub Actions (un intento por prueba, máximo 3 en toda la Fase 1, con tu aprobación en un Environment `landingsite-login`)? ¿Quién lee el buzón del agente en ese momento por si llega un correo de dispositivo nuevo o un código, y puedes estar delante?
- ¿Dónde generamos la sesión semilla? Opción 1 (la que recomiendo): en tu ordenador con un ayudante mínimo (¿sigue siendo el Windows de la Fase 0, con Node 22? Primera vez, 30 a 45 min). Opción 2: encadenarla desde el inicio de sesión de Actions con una caché, solo si el repo pasa a privado o aceptas un texto cifrado público.
- El archivo de sesión de la prueba del 03/10 (`sesion-landingsite.json`, pendiente de borrar en tu ordenador): ¿lo borras y generamos una sesión nueva con hora conocida? (Recomendado.)
- ¿Qué cuenta como sesión 'muy frágil' para activar el plan P4 del PRD (servidor pequeño)? No quiero inventar el umbral: dime una duración mínima y un porcentaje de comprobaciones válidas, o prefieres que te presente los datos y decidimos juntos.
- ¿La ventana es de 2 días exactos o la prolongamos hasta unos 8 días con 1 comprobación al día si a las 48 h sigue válida? (El máximo por defecto de Clerk suele ser 7 días; no está comprobado en LandingSite.)
- La cuenta del agente en LandingSite tiene permisos de administrador sobre el único sitio real de Restavor (Fase 0). ¿Aceptas ese riesgo mientras dura la medición, o prefieres un rol menor si LandingSite lo permite sin perder el acceso al editor? (Con un rol menor puede que no aparezca el botón 'Update restavor.com'; para esta medición bastaría con la ruta y el estado de Clerk.)
- ¿Aceptas cerrar el resto de la Fase 1 en esta sesión (esqueleto, usuario agente, funciones puras, `agente:seco`) y dejar el 'informe de duración' como pendiente de 48 h, con una tarea programada que lo cierre a las 48 h? ¿O prefieres que la Fase 1 no se dé por cerrada hasta tener el informe?
- Nombres de secretos: ¿te parece bien `SESION_CLAVE` (del PRD) más `LANDINGSITE_SESION_CIFRADA` (nombre mío, solo para la Fase 1) y el Environment `landingsite-login`? ¿Y añadimos `agents/*` a `pnpm-workspace.yaml` (toca archivos compartidos y el lockfile, y el CI pasaría a probarlo) o la carpeta del agente lleva su propio `package.json` fuera del workspace?

**Contradicciones que encontró:**
- PRD R2 (agents/menu-diario/PRD.md:530) pide el repositorio 'en GitHub, privado', y PRD §16 (:682) calcula los costes con los 2.000 min de un repo privado 'si el resto del repositorio gasta poco'. La realidad es que Restavor/Cuotly es PÚBLICO (API de GitHub: private false), con facturación 0. Si pasara a privado, el CI actual (~14 min facturables por push, al menos 11 ejecuciones el 03/10) agotaría la cuota. Además, PRD §11 ('nunca hay secretos en logs, capturas ni artefactos') pasa a ser mucho más exigente en un repo público. CLAUDE.md no dice nada de la visibilidad. Hay que preguntar a Bosco antes de construir.
- PRD §5.1-2 (:173) dice 'No uses el schedule de GitHub Actions como reloj', y PRD §14 Fase 1 (:574-575) pide un workflow que compruebe 'cada pocas horas durante 2 días'. Solo son compatibles si el schedule se limita a esta medición. Además, un schedule solo corre desde la rama por defecto, que aquí es una rama vieja de otra web (`claude/cuotly-build-from-scratch-okynpm`, también rama de producción de cuotly-movil), no desde la rama de trabajo.
- PRD §9.4 y §5.1-7 (:186-189, :434-442) guardan la sesión cifrada en el bucket `agente-menu`, pero ese bucket y sus políticas son de la Fase 2 (:584-588). La Fase 1 necesita un sitio provisional (se propone un secreto de Actions, que desaparece en la Fase 2). Y el patrón de buckets existente (privado, RLS activado, cero políticas, solo service_role) choca con la necesidad del robot de leer y escribir sin service_role.
- PRD §11 (:493) lista `LANDINGSITE_PASSWORD` como 'opcional', y §9.4 (:442) lo trata como un plan para cuando la sesión no vale, mientras D2 y D3 (:126-127) siguen diciendo que hoy se entra con Google. La decisión 155 (docs/DECISIONES.md:2654) fija la contraseña como el método de entrada y descarta Google. La Fase 0 ya avisó de que esas secciones del PRD no se tocaron (RECONOCIMIENTO.md:117). Falta actualizar D2, D3, §9.4 y los estados de sesión.
- PRD §14 Fase 1 (:576-582) y apéndice B (:723) piden demostrar todos los criterios al terminar la fase, pero uno de los criterios ('un informe de cuánto dura la sesión') necesita 48 horas de espera: no se puede cerrar en la misma sesión. Hay que acordar con Bosco cómo se cierra.
- PRD apéndice A (:708) y apéndice B usan `npm run ...` y '`npm test`', y PRD §5.2 (:193) pide el mismo lint y los mismos tests que Restavor web. CLAUDE.md fija pnpm (`packageManager: pnpm@9.15.0`) y, por PRD §0 (:17), manda CLAUDE.md en convenciones. Además `pnpm-workspace.yaml` no incluye `agents/*`, así que el CI no probaría la carpeta del agente.
- PRD §5.2 (:194) dice que Playwright va 'con los navegadores cacheados en Actions' y '<5 min por ejecución', pero el CI actual no cachea el navegador (lo reinstala en 22 a 30 s). No es un fallo, pero hay que decidir si se cachea.
- PRD §11 (:507) pide guardar artefactos 14 días como máximo, pero el valor por defecto de `actions/upload-artifact` es 90 días. Hay que fijar `retention-days` a mano. El CI usa 7.
- PRD §9.5 (:447) habla de `landingsite_sitio_id` como 'identificador que debe aparecer en la URL'. RECONOCIMIENTO.md:88 aclara que es el UUID del editor y que la cabecera pública `LS-onmfye544q` no sale en el editor. La comprobación de la Fase 1 usa el UUID (0c0495e1-74b3-4744-9aa9-d94754efcae4), no `LS-...`.

**Riesgos:**
- Repositorio público: cualquier fallo de enmascarado, una URL con parámetros `__clerk_*` impresa, una captura, un HAR o una traza quedaría visible a terceros, y un artefacto o una caché con la sesión (aunque cifrada) sería descargable. La sesión es de una cuenta con permisos de administrador sobre la única web real de Restavor (la Fase 0 mostró que el botón de publicar solo salió con ese rol), así que una fuga permitiría editar, publicar o borrar el sitio real.
- Cláusula 6(ix) de las condiciones de LandingSite (RECONOCIMIENTO.md:250-257; decisiones 152 y 155). Más inicios de sesión y más aperturas automatizadas aumentan la huella: 12 aperturas del editor en 48 h más 2 o 3 inicios de sesión. Se mantiene mínima, pero el riesgo de que suspendan la cuenta del agente existe (y la de Bosco no se pierde, por la decisión 152).
- Detección de bots: la IP del ejecutor es de centro de datos y el navegador es headless. Clerk puede pedir verificación de dispositivo nuevo por correo y Cloudflare puede lanzar un desafío o bloquear. Un falso 'sesión caducada' por un desafío distorsionaría la medición; por eso el clasificador separa `desafio_cloudflare` de `caducada`. No se intenta esquivar ninguno de los dos. No comprobado.
- Un inicio de sesión nuevo desde Actions podría invalidar la sesión semilla si LandingSite limita a una sesión por cuenta (no comprobado). De ahí el orden: primero la prueba (2), después la siembra.
- Una sesión estática puede subestimar la vida real si Clerk renueva cookies con el uso, y una comprobación cada 4 h puede alargar una sesión que tenga límite por inactividad, mientras que en producción se usará cada 24 h. Se mitiga leyendo `expireAt` y `abandonAt` si existen, y con la prórroga de 1 comprobación al día.
- `schedule`: retrasos y ejecuciones descartadas (no hay historial previo en este repo para medirlos). Y solo corre desde la rama por defecto, vieja y ligada a la producción de cuotly-movil; subir ahí el workflow lanza un despliegue de producción de cuotly-movil (solo redirige) y el ci.yml antiguo. Ya hubo un precedente el 24/09 con permiso de Bosco.
- Si el repositorio pasa a privado (PRD R2), el CI actual (~14 min facturables por push; al menos 11 ejecuciones el 03/10) consumiría los 2.000 min gratuitos en unos 140 pushes al mes, y el `schedule` de la medición (24 a 36 min) apenas se notaría frente a eso.
- El GITHUB_TOKEN no puede escribir secretos: con un secreto no hay renovación automática de la sesión. Darle esa capacidad a un workflow exigiría un token con 'Secrets: write', muy poderoso.
- Abrir el editor podría arrancar el entorno de vista previa o tener algún efecto en LandingSite (versiones, contadores de uso) que no está comprobado. Bosco debe revisar el número de versiones tras el primer disparo.
- El archivo `sesion-landingsite.json` de la Fase 0 sigue pendiente de borrar en el ordenador de Bosco. Es una credencial viva de la cuenta del agente si todavía no ha caducado.
- El `pnpm-workspace.yaml` no incluye `agents/*`, así que lint, tipos y tests de la carpeta del agente no corren en CI. Incluirlo toca archivos compartidos (workspace y lockfile).
- Cada fase del PRD termina 'demostrando todos los criterios', y el informe de duración necesita 48 h reales, así que la Fase 1 no se cierra en una sola sesión.
- Los secretos de Actions y los Environments no se pueden ver desde aquí: puede que `LANDINGSITE_*` ya existan con otro nombre, o que falte alguno. Todo lo de 'qué hay que crear' asume que no existen.

**Diseño propuesto:**

```text
DISEÑO PROPUESTO (nada construido; los nombres de archivos son propuestas)

A. Piezas
1. Workflow autocontenido `.github/workflows/agente-menu-sesion.yml`.
   - Disparadores: `schedule` con cron `23 */4 * * *` y `workflow_dispatch` con entrada `modo` (opciones `comprobar` o `login-prueba`).
   - `permissions: contents: read`.
   - `concurrency: { group: agente-menu, cancel-in-progress: false }`.
   - Constantes en `env:` (no secretas): `SITIO_UUID=0c0495e1-74b3-4744-9aa9-d94754efcae4`, `FIN_MEDICION=<fecha ISO tope>`.
   - Va a la rama por defecto `claude/cuotly-build-from-scratch-okynpm` solo si Bosco lo autoriza. Se borra al acabar.
   - Job `comprobar` (con `schedule` o `modo=comprobar`):
     - guarda `github.repository == 'Restavor/Cuotly'`; `timeout-minutes: 8`;
     - pasos: checkout de un commit de nuestra rama fijado por SHA (solo `agents/menu-diario`), setup-node 22, `npm i playwright@1.62.1`, `npx playwright install chromium`, ejecutar el script con `SESION_CLAVE` y `LANDINGSITE_SESION_CIFRADA` solo en el `env` de ese paso, y `upload-artifact` de `medicion-<run_id>.json` con `retention-days: 14`;
     - no recibe `LANDINGSITE_PASSWORD`.
   - Job `login-prueba` (solo `workflow_dispatch` con `modo=login-prueba`):
     - `environment: landingsite-login` (Bosco como revisor requerido); recibe `LANDINGSITE_EMAIL` y `LANDINGSITE_PASSWORD`;
     - un solo intento; no guarda sesión; sube su propio JSON de resultado.

2. Código en `agents/menu-diario/` (con tests, lint y tipos estrictos, en `src/core` lo puro):
   - `core/resultado-sesion.ts`: clasifica (`valida`, `caducada`, `desafio_cloudflare`, `sitio_distinto`, `indeterminado`, `error_red`) a partir de ruta final sin query, estado de Clerk, texto de barra, código HTTP y cabecera `cf-mitigated`.
   - `core/sesion-cifrada.ts`: AES-256-GCM sobre `{creada_en, storageState}` y filtro a cookies de `*.landingsite.ai`.
   - `core/informe.ts`: serializador con lista blanca de campos y un barrido de secretos.
   - `scripts/comprobar-sesion.ts`: solo `goto`, lectura y como máximo una recarga.
   - `scripts/login-prueba.ts`: una sola ejecución del formulario, con teclado solo en los dos campos de acceso.
   - `scripts/exportar-sesion.ts`: ayudante local de Bosco (versión mínima de `agente:login`); escribe un archivo, no imprime.
   - Tests con servidores simulados de Playwright (`route.fulfill`), sin peticiones reales: sesión válida, redirección a `/login`, UUID distinto, `/settings`, desafío de Cloudflare, pantalla de código por correo, centinela de cookie que no debe salir, URL con query, fecha tope, YAML (disparadores, permisos, dónde aparece la contraseña).

B. Qué hace cada ejecución de `comprobar` (sin editar, sin chat de IA)
- Si ahora > FIN_MEDICION: sale con éxito antes de descifrar nada.
- Descifra en memoria (`::add-mask::` para el JSON y cada valor de cookie), abre el contexto con ese storageState y navega a `https://app.landingsite.ai/chat/<SITIO_UUID>`.
- Espera hasta 45 s lo primero que ocurra: ruta `/login`, o editor con señales de sesión (estado de Clerk, texto 'Up to date' / 'Update restavor.com').
- Si sale a `/login`, recarga una vez a los 60 s antes de declarar `caducada`.
- Lee `Clerk.session.status` y, si existen, `expireAt`, `abandonAt` y `lastActiveAt` (solo fechas).
- Compara en memoria las cookies de inicio y de fin (nombre, dominio, httpOnly, caducidad, 'valor cambió sí/no'); nunca imprime valores.
- Escribe una línea en el resumen del job y un JSON de lista blanca como artefacto: hora UTC de inicio y fin, `run_id`, evento, `github.event.schedule`, edad de la sesión, HTTP, `cf-mitigated`, resultado, señales y tabla de cookies.
- Sale con código 0 salvo fallo de infraestructura o de guarda. 'Caducada' es un dato, no un fallo.

C. Calendario y pasos (la fecha de inicio la fija Bosco)
- Día 0, antes de sembrar: `login-prueba` nº 1 (un intento, Bosco delante). Su resultado decide si el inicio de sesión sin supervisión es viable.
- Día 0: Bosco siembra la sesión (ayudante local), pega `LANDINGSITE_SESION_CIFRADA`, y se lanza `comprobar` a mano (hora 0, mide 1a). Se revisan registro y artefacto a mano; si están limpios, queda el cron encendido.
- Días 0 a 2: 12 comprobaciones del cron (cada 4 h), aproximadamente 24 a 36 min de Actions.
- Día 2: `login-prueba` nº 2. Se apaga el cron (borrar el archivo; la fecha tope ya lo deja inerte). Se redacta `agents/menu-diario/docs/INFORME-SESION.md`: tabla de muestras, última válida y primera caducada, mínimo conocido si sigue válida, si las cookies cambian con el uso, retrasos del schedule (hora programada contra hora real), resultados del inicio de sesión, y si hace falta guardar sesión o basta con entrar cada vez.
- Prórroga opcional: si a las 48 h sigue válida, 1 comprobación al día hasta el día 8 (para cubrir los 7 días que suele ser el máximo por defecto de Clerk; no comprobado en LandingSite).

D. Qué decide el informe
- Si (2) funciona sin código ni desafío: el robot puede entrar con contraseña en cada ejecución y guardar sesión es solo una optimización.
- Si (2) pide código: la sesión sembrada por una persona es imprescindible y su duración marca cuánto trabajo manual tendrá Bosco (apéndice C).
- Si (2) da desafío de Cloudflare: IP de GitHub inviable, y toca P4 (servidor pequeño o ejecutor propio).
- El umbral de 'muy frágil' del PRD (P4) NO lo invento: lo fija Bosco.

E. Lo que NO se hace
- No se usa el chat de IA, ni se toca ningún ajuste, ni se publica.
- No se guarda la sesión en artefacto ni caché mientras el repo sea público.
- No se crea bucket ni migración (eso es Fase 2).
- No hay capturas ni trazas.
- No se lee ningún buzón.
```


---

## Anexo E · Esqueleto del paquete, CI y rama

**Resumen del explorador:** SOLO LECTURA: el repo no ha cambiado (git status vacío, HEAD c5b42ce); las pruebas se hicieron en copias dentro del scratchpad. Se puede hacer, pero hay cinco cosas que hay que decidir antes. (1) Meter agents/menu-diario en el workspace son tres cambios: añadir "agents/*" a pnpm-workspace.yaml, un package.json con los scripts lint, typecheck y test, y regenerar y subir pnpm-lock.yaml. Sin el lock, CI falla con ERR_PNPM_OUTDATED_LOCKFILE en sus tres jobs (lo reproduje). Con pnpm 9.15.0 el lock cambia poco: un bloque nuevo de importer y ningún paquete nuevo, porque todo ya está en el lock. Si el paquete declara typescript-eslint, el lock además cambia unas 70 líneas más en la resolución de eslint-config-next. Comprobé en una copia que lint de web y de mobile siguen pasando con ese lock. Un paquete de prueba con tsconfig estricto, eslint con no-explicit-any, reglas de importación en src/core y vitest pasó typecheck, lint y test, y el lint falló como debía con un "any" y con un import de Supabase en core. (2) pnpm manda sobre npm (CLAUDE.md). Los scripts se pueden llamar test, agente:seco, agente:login y agente:e2e, con alias en la raíz como el ya existente comprobar:storage. (3) CI correrá el paquete solo, porque pnpm -r ya lo recoge. El repo es PÚBLICO y su rama por defecto es una rama vieja (claude/cuotly-build-from-scratch-okynpm). El PRD supone repo privado, y eso cambia el riesgo de capturas y artefactos y el cálculo de minutos. (4) .gitignore cubre .env y .env.local en cualquier carpeta, pero NO cubre archivos de sesión, .env.pruebas, capturas de ejecución ni tmp. (5) Hay un choque de ramas y de numeración de decisiones: la rama de trabajo va 7 commits por detrás de agents, y las decisiones 151 a 155 del agente chocan con las 112 a 143 que agents ya tiene.

**Preguntas que planteó:**
- ¿Dónde se construye la Fase 1? Opción A: poner antes la rama claude/gallant-mccarthy-nrf8u4 al día con agents (7 commits de Reservas por medio) y renumerar las decisiones del agente (112 a 116 pasarían a 144 en adelante; al final fueron 149 a 153 porque agents avanzó). Opción B: continuar en esa rama sin actualizarla y resolver el conflicto después. Recomiendo A; hay que confirmarlo porque toca DECISIONES.md y CLAUDE.md.
- ¿Cómo se lanza la comprobación de sesión 'cada pocas horas durante 2 días'? Opción 1: subir un workflow con schedule a la rama por defecto actual (la vieja claude/cuotly-build-from-scratch-okynpm, que además es la rama de producción de cuotly-movil). Opción 2: cambiar la rama por defecto del repositorio a agents (ojo con lo que sigue Vercel). Opción 3: workflow_dispatch encadenado desde agents, sin tocar la rama por defecto (el primer disparo es manual). Opción 4: una rutina programada de Claude que lo lance. Recomiendo la 3; la 1 y la 2 son decisión tuya.
- El repositorio es público y el PRD lo pensó privado. ¿Lo pasas a privado antes de guardar capturas o artefactos de LandingSite? Si se queda público, ¿acepto que la comprobación de sesión no guarde capturas ni artefactos? Si lo pasas a privado, hay que mirar los minutos gratuitos: CI ya consume mucho.
- ¿Aceptas que los identificadores del código sean en inglés (computePublishFrom, sortAndFilterTasks, estados como preparing/waiting/ready) aunque los criterios del PRD los nombren en español? Los textos que ve el equipo seguirían en español. ¿Y mantengo agente:seco, agente:login, agente:e2e con esos nombres en español como scripts de pnpm?
- ¿Registro la familia de reglas RA-xx (RA-01 a RA-07) en CLAUDE.md para que cuenten como las RN-xxx a efectos de tests, o prefieres otro código?
- ¿Qué versión de Node y de pnpm hay en tu ordenador (el de agente:login)? Necesito Node 22.18 o superior si el robot ejecuta TypeScript directamente; si no, añadiríamos tsx.
- El paquete añade una regla de lint que prohíbe usar Supabase, React, Next o Playwright dentro de src/core, y declara typescript-eslint (cambia unas 70 líneas del lock en la resolución de peers de web y mobile). ¿Te parece bien, o prefieres un paquete sin ese cambio de lock (con menos reglas de lint)?
- ¿Puedes darme (o comprobar tú) la configuración de GitHub que no puedo leer desde aquí: permisos por defecto del GITHUB_TOKEN en Actions, retención de artefactos, qué secretos existen (por nombre: PRUEBAS_DATABASE_URL, etc.) y si hay Environments? Con eso decido si los secretos del agente van como secretos de repositorio o de un Environment 'pruebas'.

**Contradicciones que encontró:**
- NOMBRES EN ESPAÑOL (PRD) frente a IDENTIFICADORES EN INGLÉS (CLAUDE.md). El PRD usa calcularPublicarDesde(), ordenarYFiltrar(), el esquema agente_menu, tablas y columnas como tareas, restaurantes, estado, publicar_desde, y estados como preparando, esperando, lista... CLAUDE.md ('Estilo de código') exige identificadores, tablas, columnas y funciones en inglés y todo el texto visible en español vía i18n. Mi lectura: el propio PRD §0 dice que en convenciones de código manda CLAUDE.md, y en §8 dice que los nombres de datos son 'una propuesta: adapta los nombres a las convenciones del repositorio', así que no hay que parar a preguntar. Propuesta: funciones en inglés (computePublishFrom, sortAndFilterTasks), códigos de estado en inglés (preparing, waiting, ready, publishing, verifying, published, error, session_blocked, cancelled, returned) y su etiqueta en español en src/i18n/es.ts, y los objetos de base de datos en inglés (Fase 2). Ojo con el prefijo: agent_ ya lo usan las tablas de Restavor agents (agent_state, agent_api_keys, agent_calls...), así que mejor menu_agent_* o un esquema menu_agent para no chocar. Los criterios de aceptación del PRD citan los nombres españoles: habrá que dejar escrita la equivalencia (por ejemplo en el CLAUDE.md del agente).
- NPM (PRD) frente a PNPM (repo). El PRD pide 'npm test' y 'npm run agente:seco/login/e2e' (Apéndice A y C) pero CLAUDE.md fija pnpm y el lock es de pnpm. Manda CLAUDE.md: se usa pnpm, y los textos del PRD (Apéndice A, y la frase del Apéndice C que Bosco copia) deben actualizarse.
- NOMBRES DE SCRIPT EN ESPAÑOL (agente:seco, agente:login, agente:e2e) frente a 'identificadores en inglés'. Ambiguo: un nombre de script npm no es un identificador de código en sentido estricto y ya existe el precedente comprobar:storage (raíz y apps/web). Mi lectura: mantenerlos tal cual porque aparecen en emails y en instrucciones a Bosco; a confirmar.
- CÓDIGOS DE REGLA RA-01 a RA-07 (PRD) frente a la regla 3 de CLAUDE.md (todo RN-xxx del PRD necesita un test que cite su número). Las reglas del agente se llaman RA-xx, familia que no figura en la lista de códigos nuevos de CLAUDE.md (RN-APP, RN-AGT, RN-RES, RN-LLA; RN-AGT ya es de Restavor agents). Propuesta: los tests citan 'RA-01' en el nombre, y Bosco decide si esa familia se registra en CLAUDE.md.
- REPOSITORIO PRIVADO (PRD R2, §16) frente a repositorio PÚBLICO (API de GitHub). Afecta a la exposición de registros y capturas (PRD §11) y a los minutos de Actions (§16 da por hecho 2.000 min/mes y 'si el resto del repositorio gasta poco', pero CI ya lleva 470 ejecuciones de tres jobs). Es comportamiento de producto/seguridad, no convención de código: pregunta a Bosco.
- WORKFLOW 'CADA POCAS HORAS' (PRD §14 Fase 1) frente a 'no uses el schedule de GitHub Actions como reloj' (PRD §5.1-2) y frente a la regla técnica de que schedule solo corre desde la rama por defecto (aquí, la vieja claude/cuotly-build-from-scratch-okynpm). Hay que decidir cómo se lanza la comprobación de sesión (ver preguntas).
- CLAUDE.md DEL AGENTE (Apéndice A) frente a CLAUDE.md RAÍZ. Su línea de comandos ('npm test · npm run agente:seco ...') choca con la raíz (pnpm). El raíz dice que si algo choca, manda el raíz. El CLAUDE.md anidado debe copiar el flujo obligatorio (pnpm typecheck && pnpm lint && pnpm test al terminar cada tarea) y no redefinirlo.
- RAMA DE TRABAJO frente a CLAUDE.md. CLAUDE.md dice que Restavor agents se construye 'en la rama agents'; el trabajo del Agente Menú Diario está en claude/gallant-mccarthy-nrf8u4, que va 7 commits por detrás de agents, y sus decisiones (entonces 112 a 116, hoy 151 a 155) repetían números que agents ya usaba (112 a 143). Además pruebas-supabase.yml solo aplica migraciones si la subida es a la rama agents (guarda en el propio workflow), lo que importa para la Fase 2.
- PRD §5.2 ('el robot debe poder ejecutarse en cualquier máquina Linux sin cambios') frente a D10 (reutilizar el generador de PNG de Restavor web, que usa next/og y vive en apps/web). No afecta a la Fase 1, pero decide si el código compartido se extrae a packages/shared o se duplica. Ya anotado en parte en el reconocimiento (C3 sobre el esquema agente_menu sin políticas frente a las reglas de RLS de CLAUDE.md; sigue sin afectar a la Fase 1).

**Riesgos:**
- CI roto en tres jobs si se sube el paquete sin regenerar pnpm-lock.yaml (ERR_PNPM_OUTDATED_LOCKFILE, reproducido). Vercel de cuotly-web también instala sobre el workspace (no comprobado). No hay protección de ramas: nada impediría subirlo roto.
- Cambio de resolución de dependencias en apps/web y apps/mobile por tener typescript-eslint como dependencia directa del paquete nuevo (unas 70 líneas del lock). En la copia del scratchpad lint de web y de mobile siguen pasando, pero hay que repetirlo en el repo real y vigilar CI. No comprobado: typecheck y tests completos de web y mobile con ese lock.
- Repositorio público con workflows que manejarán credenciales de LandingSite y capturas de su editor: los registros son públicos y los artefactos descargables por cualquier usuario de GitHub con sesión. No pude leer los permisos de Actions, la retención de artefactos ni los secretos (403 del proxy).
- schedule no puede salir de la rama agents: solo corre desde la rama por defecto, que es la vieja claude/cuotly-build-from-scratch-okynpm (última subida 24/09/2026, 429 commits detrás de agents) y que además es la rama de producción de cuotly-movil en Vercel. Subir ahí un workflow dispararía su despliegue y CI. Cambiar la rama por defecto del repo podría cambiar a qué rama sigue Vercel (no comprobado).
- Conflicto de ramas y de numeración: la rama de trabajo está 7 commits por detrás de agents (Fases C, D y E1), y las decisiones del agente (entonces 112 a 116, hoy 151 a 155) colisionaban con las 112 a 143 de agents; CLAUDE.md (línea 71 con la excepción del agente) difiere entre ramas. La siguiente decisión libre en agents es la 144 (a fecha de e813d87). Las referencias a la 'decisión 112' (hoy 149) en CLAUDE.md, docs/PRD.md (RN-CRE-25) y RECONOCIMIENTO.md hay que revisarlas al renumerar.
- Fuga de secretos por .gitignore incompleto: un storageState en claro, .env.pruebas o capturas de ejecución no están ignorados y el repo es público. La cookie __client de LandingSite dura 400 días.
- Chromium distinto según dónde se ejecute: CI y máquinas normales descargarán el 151 (Playwright 1.62.1); este entorno en la nube tiene el 141 y Bosco usó Chrome 154 en su ordenador. El comportamiento frente a LandingSite puede variar. Además, posible reto anti-bot de Cloudflare en las IPs de los runners de GitHub (no comprobado; LandingSite usa cookies de Cloudflare).
- Ejecutar .ts con Node nativo exige Node >=22.18 en cualquier máquina (incluido el ordenador de Bosco para agente:login, versión no comprobada) y restringe la sintaxis (sin enums ni parameter properties, imports con .ts). Alternativa: añadir tsx, que mete esbuild y más paquetes en el lock.
- pnpm -r test ejecutará los tests del agente en CI sin secretos ni red: cualquier test que necesite Supabase o LandingSite debe quedar fuera de 'test' (agente:e2e aparte). Un paquete sin archivos de test hace fallar vitest run.
- Efecto colateral conocido, ajeno al paquete: en un clon limpio pnpm typecheck falla en apps/web sin 'next typegen' (también lo vio el reconocimiento).
- ci.yml no tiene timeout-minutes, ni concurrency, ni permissions: los workflows nuevos no deben copiar ese patrón (el GITHUB_TOKEN usaría los permisos por defecto del repo, que no pude consultar).
- Cambio de hora real a la vista: el 25/10/2026 (22 días). Un error en la regla de víspera (17:00 local) se manifestaría justo en la ventana de las Fases 2 a 5; los tests de Fase 1 deben cubrir octubre y marzo con valores UTC exactos.

**Diseño propuesto:**

```text
ESTRUCTURA DE CARPETAS (todo nuevo, bajo agents/menu-diario/; ya existen PRD.md, docs/ y sql/):
agents/menu-diario/
  CLAUDE.md                 Apéndice A adaptado a pnpm; no redefine el flujo de la raíz
  .gitignore                .env*, !.env.example, sesion*.json, *.storage-state.json, .auth/, sesion*.enc, artefactos/, evidencias/, capturas-ejecucion/, tmp/
  package.json  tsconfig.json  eslint.config.mjs  vitest.config.ts
  src/core/                 lógica pura (reloj, orden, estados de tarea, tipos Result). Sin Supabase, Next, React, Playwright, Anthropic ni imports de ../services. Cada función recibe 'now: Date' y la zona horaria; nunca Date.now(). Tests junto al código (*.test.ts), como en apps/web/src/core
      publish-from.ts       computePublishFrom  (= calcularPublicarDesde): { past } | { from: Date }
      sort-and-filter.ts    sortAndFilterTasks  (= ordenarYFiltrar): orden por target_date y regla de orden de 7.1
      local-time.ts         apoyo en zonedTimeToUtc (copiado de business-clock.ts con sus tests, o importado; decidir)
      task-state.ts         códigos de estado en inglés
  src/i18n/es.ts            todo texto visible: motivos de error que verá el equipo ('La fecha del menú ya ha pasado'), salida de agente:seco, emails (el core devuelve códigos, no frases)
  src/services/             adaptadores: cliente de Supabase con anon key + sesión del agente (nunca service_role), lector de cola (team_menu_queue, menu_deadlines), logger
  scripts/                  dry-run.ts (agente:seco, SOLO LECTURA), session-check.ts (workflow de Fase 1); más adelante login.ts y e2e.ts
FICHEROS MÍNIMOS (probados en el scratchpad):
- package.json: name @cuotly/daily-menu-agent, private, type module, engines node >=22.18; scripts lint 'eslint .', typecheck 'tsc --noEmit', test 'vitest run', agente:seco 'node scripts/dry-run.ts' (login y e2e cuando existan); dependencies @supabase/supabase-js ^2.112.4 y playwright 1.62.1; devDependencies @types/node ^20, eslint ^9, typescript ^5, typescript-eslint ^8.68.0, vitest ^4.1.11 (mismas versiones que ya resuelve el lock).
- tsconfig.json: target ES2022, lib ES2022, module ESNext, moduleResolution Bundler, strict, noUncheckedIndexedAccess, verbatimModuleSyntax, erasableSyntaxOnly, allowImportingTsExtensions, isolatedModules, noEmit, types ['node'] (modelado sobre packages/shared/tsconfig.json; no se crea tsconfig base raíz para no tocar los otros paquetes).
- eslint.config.mjs (flat): typescript-eslint recommended, no-explicit-any en error, reportUnusedDisableDirectives, y en src/core/** no-restricted-imports de @supabase/*, next, react, react-dom, playwright, playwright-core, @anthropic-ai/* y **/services/**. Así CLAUDE.md ('lógica pura', 'sin any') se hace cumplir por máquina.
- vitest.config.ts: environment node, include src/**/*.test.ts y tests/**/*.test.ts (la e2e real, con red, queda fuera de 'pnpm test').
CAMBIOS EN FICHEROS EXISTENTES: pnpm-workspace.yaml (+ \"agents/*\"); package.json raíz (alias agente:seco, agente:login, agente:e2e que reenvían con pnpm --filter, como comprobar:storage); pnpm-lock.yaml (regenerar con pnpm 9.15.0, revisar el diff: bloque nuevo + cambios de sufijos de eslint-config-next, sin paquetes nuevos, y repasar pnpm install --frozen-lockfile). ci.yml NO necesita cambios.
WORKFLOW DE SESIÓN (nuevo, p. ej. .github/workflows/agente-menu-sesion.yml): workflow_dispatch (más schedule solo si Bosco decide poner el archivo en la rama por defecto), concurrency group agente-menu con cancel-in-progress false (lo pide el PRD), permissions contents read, nunca pull_request_target; pnpm 9.15.0 + node 22; instalación filtrada al paquete; caché de ~/.cache/ms-playwright por versión de Playwright; playwright install --with-deps chromium; secretos LANDINGSITE_EMAIL, LANDINGSITE_PASSWORD y SESION_CLAVE (idealmente como secretos de un Environment 'pruebas'); sin capturas ni artefactos mientras el repo sea público, o solo con campos sensibles ocultos. Solo comprueba, no edita.
ORDEN DE TRABAJO SUGERIDO PARA LA FASE 1: (1) poner la rama al día con agents y renumerar decisiones; (2) esqueleto + lock + CI en verde; (3) core con los 8 casos de PRD 7.1 más los cambios de hora de 25/10/2026 y 29/03/2026; (4) agente:seco de solo lectura; (5) workflow de sesión.
```
