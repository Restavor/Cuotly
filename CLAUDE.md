# CLAUDE.md — Cuotly

Reglas permanentes de este repositorio. Son obligatorias, no sugerencias.
La especificación funcional está en `docs/PRD.md`. El plan de fases en `docs/ROADMAP.md`.
El documento maestro completo del producto está en `docs/ESPECIFICACION-MAESTRA.md` (referencia de fondo).

**Jerarquía de autoridad:** `CLAUDE.md` > `docs/PRD.md` > `docs/ESPECIFICACION-MAESTRA.md`.
Si detectas una contradicción entre los tres, PARA y pregúntame. No la resuelvas por tu cuenta.

---

## Comandos

```bash
pnpm dev              # servidor de desarrollo
pnpm typecheck        # comprobación de tipos (debe pasar siempre)
pnpm lint             # eslint
pnpm test             # tests unitarios (vitest)
pnpm test:e2e         # tests end-to-end (playwright)
supabase start        # base de datos local
supabase db reset     # recrear BD local aplicando migraciones + seed
supabase migration new <nombre>   # nueva migración (NUNCA editar una migración ya aplicada)
```

## Flujo de trabajo obligatorio

1. Antes de escribir código de una tarea nueva, lee las secciones del PRD que la cubren.
2. Al terminar cada tarea: `pnpm typecheck && pnpm lint && pnpm test`. No declares una tarea terminada si algo falla.
3. Toda regla de negocio con número (`RN-xxx`) del PRD debe tener al menos un test que la cubra, y el test debe citar el número de la regla en su nombre.
4. Cada migración de base de datos es un archivo nuevo y versionado. Nunca modifiques una migración existente.
5. Cuando termines un hito del ROADMAP, para y avísame antes de empezar el siguiente.

## Reglas duras de producto

- **MUST**: toda operación se valida en el servidor. Ocultar un botón NO es un control de acceso. Una función no está terminada hasta que un usuario sin permiso tampoco pueda ejecutarla por URL o llamada directa.
- **MUST**: toda tabla que pertenezca a un espacio lleva `space_id NOT NULL` y tiene RLS **activado** con políticas explícitas. Ninguna tabla se crea sin RLS.
- **MUST**: los cálculos de consumos, permisos, pagos, contadores de tiempo y estados derivados se hacen en el servidor. El cliente nunca es la autoridad.
- **MUST**: consumos y movimientos financieros se registran como **libro inmutable** de apuntes con signo. NUNCA un contador que se actualiza con UPDATE.
- **MUST**: todo cambio de estado relevante genera un evento y un registro de auditoría con actor, fecha, valor anterior, valor nuevo y motivo cuando proceda. Los registros de auditoría no se editan ni se borran desde la aplicación.
- **MUST**: las operaciones críticas (aceptar, comenzar, publicar, pagar, consumir crédito) usan transacción + clave de idempotencia. Pulsar dos veces nunca duplica el efecto.
- **MUST**: las fechas se guardan en `timestamptz` y se calculan en la zona horaria del espacio.
- **MUST NOT**: mostrar al cliente el nombre, foto o identidad individual de nadie del equipo de mantenimiento. El cliente siempre ve "Equipo de mantenimiento". Como RLS filtra filas pero **no columnas**, esto se sostiene con privilegios de columna: `revoke select on <tabla> from anon, authenticated` seguido de `grant select (<columnas sin identidad>)`. Consecuencia práctica que hay que tener presente al escribir pantallas: **`select *` sobre esas tablas devuelve 403**, y también filtrar u ordenar por una columna revocada — toda consulta debe enumerar columnas. Afecta hoy a `messages`, `message_edits`, `files`, `file_versions`, `file_links`, `charges`, `payments`, `payment_confirmations`, `receipts`, `financial_entries`, `requests`, `subscriptions` y `corrections`. Cuando el equipo sí necesita ver quién hizo qué, sale de `audit_log` o de una función que comprueba permisos, nunca de la columna.
  El privilegio de columna es para tablas cuya **fila** sí es del cliente (su mensaje, su archivo, su corrección) y solo hay que taparle una columna. Cuando la fila entera es organización interna del equipo —`assignments`, `tasks` y los `state_events` de tarea— no se tapa la columna: se deja al cliente fuera de la fila con RLS (principio P7 del PRD, "el cliente no ve la organización interna"). Confundir los dos casos fue el bloqueante B2 de la cuarta revisión.
  Nada de esto se sostiene con una lista escrita a mano: se escapó tres veces. Lo que lo sostiene es el barrido de `supabase/tests/hito7_mensajes_archivos_finanzas.sql`, que recorre **todas** las columnas con clave ajena a `profiles` sentado como cliente y falla si alguna le devuelve el uuid de alguien del equipo.
- **MUST NOT**: mostrar datos ficticios, de ejemplo o rellenos de relleno en pantallas de producción. Si no hay dato, se dice cuál es el motivo (no conectado / sin datos todavía / error / periodo insuficiente).
- **MUST NOT**: borrar físicamente registros de negocio. Se archiva o se marca como eliminado.
- **MUST**: una función interna (`SECURITY DEFINER` que no comprueba permisos por su cuenta, o reservada a `service_role`) se protege con `revoke all on function ... from public, anon, authenticated`. **Nunca solo `from public`**: un proyecto de Supabase concede `EXECUTE` por defecto a `anon` y `authenticated` sobre toda función nueva, así que revocar solo a PUBLIC deja la función abierta por RPC a cualquiera, con sesión o sin ella. Verificado en vivo el 30/08/2026 (migración `20260830000024`), donde nueve funciones que se creían internas resultaron ser públicas. Esto no se reproduce en un PostgreSQL desnudo: para comprobarlo en local hay que replicar antes `alter default privileges in schema public grant execute on functions to anon, authenticated, service_role`.

## No inventes lo que está pendiente

Estos puntos están **aplazados deliberadamente**. Si una tarea los toca, deja el placeholder documentado y pregúntame. NO inventes reglas, fórmulas ni umbrales:

- Agente Cuotly: solo existe la entrada de menú con la etiqueta "Próximamente". Sin funcionalidad simulada.
- Fórmula ponderada de recomendación de trabajador (usa el orden determinista del PRD, no inventes porcentajes).
- Categoría de puntos para tareas de más de 4 horas.
- Umbrales concretos de detección de oportunidades y definición de impacto/esfuerzo.
- Todo el bloque legal y fiscal: términos, privacidad, retenciones, numeración fiscal de facturas, jurisdicción.
- API pública y webhooks.
- Precio del almacenamiento adicional.
- Sincronización bidireccional de calendarios.

## Decisiones que NO deben reaparecer

- Cuotly es multiempresa, no solo el espacio de Restavor.
- Menú Diario: 30 actualizaciones (no 25). 229 € + IVA, o 199 € + IVA si el establecimiento es Premium.
- Planes: Básico 99 €, Impulso 399 €, Premium 599 €, todos + IVA. Básico NO incluye ningún cambio ni fotografía.
- Permanencia de mantenimiento: 3 meses. No existen bolsas de horas.
- "Supervisor" no es un rol: es una relación Administrador–Trabajador.
- El supervisor NO aprueba antes de publicar. El trabajador publica directamente.
- El reloj contractual empieza el lunes a las 09:00, no a las 00:00.
- El horario de soporte humano es un reloj distinto y no afecta a los plazos contractuales.
- Los mensajes se editan durante 10 minutos y no se eliminan nunca.
- Menú Diario no tiene botón "Comenzar".
- Reservas y delivery no se monitorizan.
- No existe botón "Sincronizar ahora" en las integraciones analíticas.
- Sin Stripe: los pagos se registran manualmente (transferencia o Bizum).
- Sin modo oscuro, sin selector de densidad, sin marca blanca, sin publicidad.
- No se crean bases de datos ni proyectos separados por restaurante.

## Estilo de código

- TypeScript estricto. `strict: true`, sin `any` salvo justificación en comentario.
- Identificadores, nombres de tablas, columnas y funciones en **inglés**. Todo el texto visible al usuario en **español**, siempre a través del sistema de i18n (`src/i18n/es.ts`). Nunca literales de UI incrustados en los componentes.
- Lógica de dominio pura (reloj laboral, consumos, permisos, estados) en `src/core/`, sin dependencias de Supabase, Next ni React, y con tests unitarios. Los adaptadores externos viven en `src/services/`.
- Colores, espaciados y tipografía solo mediante los tokens del sistema Emerald Control. Nunca un hexadecimal suelto en un componente.
- Errores de negocio como tipos de resultado explícitos, no como excepciones genéricas.
