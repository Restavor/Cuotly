# Agente Menú Diario

Reglas de esta carpeta. Se suman a las del `CLAUDE.md` de la raíz, que **manda** si algo choca (jerarquía: `CLAUDE.md` raíz > este archivo > `PRD.md` de esta carpeta).

- Fuente de verdad del producto: `PRD.md`. Haz solo la fase que se pide y para al terminarla. El plan de la Fase 1 y su estado están en `docs/PLAN-FASE-1.md`.
- Las decisiones de Bosco que cambian el PRD están en `docs/DECISIONES.md` de la raíz: **151 a 155** (Fase 0), **156** (cuándo publica el agente), **157** (cuentas, repo privado, rama), **158** (el agente siempre sabe qué día y hora es), **159** (permiso y orden de las escrituras de Bar Demo), **160** (la Fase 1 se cierra sin esperar las 48 h) y **161** (el modo aprobación dura 1 semana desde que terminen todas las fases). Donde el PRD dice otra cosa, mandan ellas.
- IMPORTANT: pruebas solo en Supabase «Restavor pruebas» (`bnucqykimngjwcrlpmsm`) y en la web de pruebas de LandingSite. Nunca producción ni webs de clientes sin OK explícito de Bosco. Nunca se autoriza al agente en Magariños (web real).
- No modificar funciones, tablas ni políticas existentes de Restavor web: solo migraciones nuevas (única excepción: la 153, que saca al agente de los repartos de trabajos y tareas, y se propone en la Fase 2 antes de escribirla).
- Las RPC de Restavor web que usan `auth.uid()` solo las llama el robot como usuario agente. **El robot nunca usa `service_role`.** El chat de IA de LandingSite solo se usa para subir el menú (PRD §9.2).
- La guarda de sitio (PRD §9.5) se aplica siempre en código, también en el rescate, y comprueba el **UUID** del editor, no `LS-…` (RECONOCIMIENTO).
- **Credenciales nunca por el chat ni en el repositorio**: correo y contraseña del agente en Restavor web, de LandingSite y `SESION_CLAVE` van como secretos de GitHub Actions o variables del entorno. Nada de eso en logs, capturas ni artefactos.
- **Ningún workflow que use credenciales hasta que el repositorio sea privado** (decisión 157).
- El agente siempre sabe qué día y hora es (decisión 158): el reloj lo lee quien arranca y se pasa como dato (`now`). En `src/core` el lint impide leer el reloj (`Date.now()`, `new Date()` y `Date()` sin argumentos, `performance`, `crypto`, `process`, `.format()` sin fecha) y lo prueba `tests/core-purity-lint.test.ts`. No caza un alias (`const D = Date`): eso se vigila en la revisión.

## Comandos

Con **pnpm** (manda la raíz; el PRD original decía `npm` y ya está corregido). Desde la raíz, como en cualquier tarea: `pnpm typecheck && pnpm lint && pnpm test`.

```bash
pnpm --filter @cuotly/daily-menu-agent test        # tests de este paquete (sin red ni secretos)
pnpm --filter @cuotly/daily-menu-agent lint
pnpm --filter @cuotly/daily-menu-agent typecheck
```

**`agente:seco`** (Fase 1): prueba en seco de solo lectura. Entra como el agente, lee la cola de Menú Diario y dice, menú por menú, qué haría y a qué hora. **No escribe nada.**

```bash
pnpm agente:seco                                     # desde la raíz (alias de `pnpm --filter @cuotly/daily-menu-agent agente:seco`)
pnpm agente:seco --restaurante=EST-0001              # solo ese restaurante: restringe, nunca añade
pnpm agente:seco --ahora=2026-10-04T08:00:00+02:00   # reloj simulado: solo aquí y con un cartel que lo avisa
node agents/menu-diario/scripts/dry-run.ts           # sin pnpm: el código de salida llega tal cual
```

- Variables de entorno (nunca en el repositorio ni por el chat): `RESTAVOR_SUPABASE_URL`, `RESTAVOR_SUPABASE_ANON_KEY`, `AGENTE_EMAIL`, `AGENTE_PASSWORD`. Se niega a arrancar si la dirección no es la de «Restavor pruebas»; producción tiene su propio error.
- Código de salida: **0** bien · **1** no se pudo leer · **2** configuración, inicio de sesión o reloj. `pnpm` convierte el 2 en 1; con `node` directo se ve el 2.
- «Restaurantes activados» en la Fase 1 = agente autorizado en él ∧ `web_platform = landing_site` ∧ no eliminado. La Fase 2 lo sustituye por `agente_menu.restaurantes`.
- Por qué no escribe: tres capas, y ninguna sola basta. (1) El código no escribe: el lint prohíbe `.insert/.update/.delete/.upsert` en los archivos de la prueba en seco. (2) `src/services/read-only-gate.ts`: el `fetch` solo deja pasar GET de una lista cerrada de tablas y columnas, GET de `team_menu_queue` y el inicio y cierre de sesión; lo demás se rechaza antes de salir del ordenador. (3) En la base, `supabase/tests/agente_menu_seco.sql` (corre en CI) falla si `team_menu_queue` o cualquier función que se ejecuta al leer deja de ser de solo lectura, y `tests/seco-sql.test.ts` falla si las listas de ese SQL y las de la puerta dejan de coincidir. Cuando se demuestra contra la base real, además, quien la demuestra cuenta las filas de todas las tablas de `public` antes y después con una conexión privilegiada que **no** es del robot.

`agente:login` y `agente:e2e` (PRD Apéndice A) llegan con su fase: no se declaran hasta que existan sus archivos.

## Código

- TypeScript estricto, sin `any`. Identificadores en **inglés**; texto visible en **español**, siempre en `src/i18n/es.ts`.
- `src/core/` es lógica pura: sin Supabase, Next, React, Playwright ni IA, sin adaptadores, sin textos de pantalla y sin leer el reloj. Devuelve **códigos** y errores como `Result`, no excepciones. El lint (`eslint.config.mjs`, probado en `tests/core-purity-lint.test.ts`) impide los imports prohibidos, `any` y las formas directas de leer el reloj; que los errores sean `Result` y que no haya textos de pantalla en el núcleo no lo comprueba ninguna máquina y se vigila en la revisión.
- Los adaptadores (cliente de Supabase, navegador, correo) viven en `src/services/`.
- Cada regla `RA-xx` de `docs/reglas.md` tiene, en cuanto se implementa (la fase está en esa tabla), al menos un test que cite su código en el nombre («RA-01 · …»).
- Los tests de este paquete no tocan red ni secretos: `pnpm test` también corre en CI. Lo que necesite Supabase o LandingSite va aparte.

## Equivalencias PRD ↔ código

| El PRD dice | En el código |
|---|---|
| `calcularPublicarDesde()` | `computePublishFrom()` (`src/core/publish-from.ts`) |
| `ordenarYFiltrar()` | `orderAndFilter()` (`src/core/order-and-filter.ts`) |
| `HORA_VISPERA` (17:00 de la víspera) | **desaparece** (decisión 156). La sustituye `otherDayHour`, 07:00 del día del menú |
| `preparando` · `esperando` · `lista` | `preparing` · `waiting` · `ready` |
| `publicando` · `verificando` · `publicada` | `publishing` · `verifying` · `published` |
| `error` · `bloqueada_sesion` | `error` · `session_blocked` |
| `cancelada` · `devuelta` | `cancelled` · `returned` |
| «La fecha del menú ya ha pasado» | `date_in_past` → `es.orderReason.date_in_past` |
| «Ya hay publicado un menú de un día posterior» | `later_day_already_published` → `es.orderReason.later_day_already_published` |
| `agente_menu` (esquema) y `agente_menu_*` | Fase 2, en inglés y con el prefijo que no choque con `agent_` de Restavor agents (a decidir en el plan de la Fase 2) |

## Con Bosco

Antes de dar algo por terminado: tests en verde y evidencia (salida, consultas o capturas). Habla con Bosco en lenguaje sencillo: no es programador.
