# Reglas del Agente Menú Diario (RA-01 a RA-08)

Igual que las `RN-xxx` de Restavor web (`CLAUDE.md` raíz, flujo obligatorio, punto 3): toda regla con código tiene al menos un test que cite su código en el nombre.
Las RA-01 a RA-07 vienen del PRD (`PRD.md` §7). La **RA-08** nace de la decisión 156 de Bosco (03/10/2026).

| Código | Qué dice | Dónde se define | Fase en que se prueba | Test |
|---|---|---|---|---|
| **RA-01** | **Cuándo se publica y en qué orden.** Hoy: al llegar la solicitud, cada vez (sustituye al anterior). Otro día: a las 07:00 del día del menú, con la última versión enviada. Día pasado: no se publica. En cada ejecución, por fecha del menú ascendente; una tarea no se publica si el mismo restaurante tiene otra con día posterior ya publicada o en curso (red de seguridad). | Decisión 154 (sustituye a PRD §7.1, que decía «víspera a las 17:00»); PRD §7.1 para el orden | **Fase 1** | `src/core/publish-from.test.ts`, `src/core/order-and-filter.test.ts` |
| **RA-02** | Asignación al agente (`agente_menu_asignar`): solo restaurantes activados y menús `daily`; qué se reasigna y qué no se toca; devolver al equipo. | PRD §7.2 | Fase 2 | — |
| **RA-03** | Modo por restaurante: `aprobacion` (por defecto) o `automatico`. | PRD §7.3 | Fase 2 y 4 | — |
| **RA-04** | Republicaciones: un menú ya publicado que se vuelve a mandar crea publicación y tarea nuevas, con las mismas reglas. | PRD §7.4 | Fase 2 y 5 | La parte de «mismo día» ya está cubierta en RA-01 (uno a las 8:00 y otro a las 9:00) |
| **RA-05** | Errores, reintentos y plazos: 2 reintentos con 5 min de separación; error definitivo con motivo y aviso; sesión caducada; sin aprobación. | PRD §7.5 | Fase 4 y 5 | — |
| **RA-06** | Idempotencia: una tarea por publicación; si ya está publicado con esa versión, no se hace nada; atajo tras un corte solo con `subida_hecha` y verificación estricta. | PRD §7.6 | Fase 2 y 5 | — |
| **RA-07** | Lo que el agente no toca: restaurantes no activados, sin LandingSite, menús que no son `daily`; servicio detenido → cancelada y devuelta. | PRD §7.7 | Fase 2 y 5 | — |
| **RA-08** | **El agente siempre sabe qué día y hora es.** Lee la hora al empezar, la deja escrita en su registro y en cada decisión, la contrasta con la de Supabase y se para si difieren más de 5 minutos. `--ahora` solo en la prueba en seco. | Decisión 156 | **Fase 1** (parte pura); la lectura de los dos relojes llega con `agente:seco` | `src/core/clock.test.ts`, `src/i18n/es.test.ts` |

## Puntos abiertos de RA-01 (no se inventan; los decide Bosco en la fase que se indica)

- Una tarea atascada en `publishing` o `verifying` tras un corte de la ejecución bloquearía para siempre a las anteriores del mismo restaurante. Sin plazo ni rescate definidos (Fases 2 y 5).
- Una tarea en `error` **después** de haber subido la imagen: ¿ocupa la web? Hoy no cuenta (Fases 2 y 5).
- Un menú de otro día publicado **a mano** por una persona no bloquea al agente (la regla solo ve tareas). `agente:seco` lo mostrará como aviso «sin regla».
- Con la decisión 154, el límite de aprobación del PRD (`menu_publish_by_at − 60 min`) cae en las 07:00, la misma hora de publicar. Se revisa en la Fase 4.
