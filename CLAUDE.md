# CLAUDE.md — Cómo trabajar en el repositorio de Cuotly

Este archivo son las instrucciones permanentes para cualquier sesión de Claude Code que
trabaje en este repositorio. Léelo entero al empezar a trabajar.

## 1. Quién es quién

- **Bosco Núñez** es el propietario del producto (Restavor). Es la primera vez que usa
  Claude Code. No des por hecho que conoce términos técnicos (migración, política RLS,
  worktree, etc.) — explícalos en lenguaje llano la primera vez que aparezcan en una
  conversación con él.
- Tú (Claude Code) eres quien implementa. Bosco decide el alcance y el orden; tú decides
  el "cómo" técnico, pero solo dentro de lo ya acordado en los documentos de este repo.

## 2. Los documentos del proyecto, y cuándo leer cada uno

| Documento | Qué es | Cuándo leerlo |
|---|---|---|
| `CLAUDE.md` (este archivo) | Reglas de colaboración y de trabajo en el repo | Entero, al empezar cualquier sesión |
| `docs/PRD.md` | Qué construimos, por qué, y el alcance de la Fase 1 | Entero, al empezar cualquier sesión |
| `docs/ROADMAP.md` | En qué orden lo construimos (fases e hitos) | Entero, al empezar cualquier sesión |
| `docs/PLAN-H1-H2.md` | Plan detallado de los hitos activos (se sustituye cuando avanzamos de hito) | Entero, al empezar cualquier sesión |
| `docs/ESPECIFICACION-MAESTRA.md` | Especificación funcional completa del producto (180 secciones) | **NUNCA entero.** Solo la sección concreta a la que te remita el PRD o el ROADMAP. Es un documento muy largo; leerlo completo desperdicia contexto sin necesidad. |

Cuando el PRD diga algo como "ver Especificación Maestra §44", ve directamente a esa
sección con una búsqueda, no leas el archivo de principio a fin.

## 3. Cómo trabajamos: hito a hito

- El trabajo avanza **hito a hito**, en el orden fijado en `docs/ROADMAP.md`. No adelantes
  trabajo de hitos posteriores, aunque te parezca más eficiente hacerlo ya.
- Al terminar un hito, **paras**. Enseñas a Bosco evidencia real de que funciona: salida de
  los tests, capturas de pantalla si hay interfaz, o una demostración de la funcionalidad.
  No sigas al siguiente hito sin su visto bueno explícito.
- Un hito no está "hecho" solo porque el código compila. Tiene que demostrarse que hace lo
  que el plan de ese hito decía que haría.

## 4. Cuándo PARAR y preguntar en vez de decidir

Para y pregunta a Bosco, sin intentar resolverlo tú, cuando:

1. **Encuentres una contradicción** entre `CLAUDE.md`, `docs/PRD.md` y `docs/ROADMAP.md`.
   No decidas cuál prevalece — pregúntale.
2. **Una tarea toque algo de la sección 24 del PRD** ("Pendientes deliberados"): legal,
   Agente Cuotly, API y webhooks, almacenamiento adicional, o fórmulas/umbrales aún sin
   calibrar (asignación automática, categorías de tareas largas, umbrales de oportunidades).
   Estas cosas están así a propósito — no inventes una regla para rellenar el hueco.
3. **Vayas a tomar una decisión de producto** (qué hace o no hace Cuotly, qué ve o no ve
   un usuario) que no esté ya escrita en el PRD o en la Especificación Maestra. Las
   decisiones técnicas de implementación (qué librería, qué estructura de carpetas) sí
   puedes tomarlas tú, explicándolas.
4. **Vayas a hacer algo difícil de revertir** fuera de este repositorio: crear o modificar
   infraestructura real (proyectos de Supabase/Vercel/Resend/Expo), desplegar a producción,
   o cualquier acción que cueste dinero o afecte a servicios externos.

## 5. Cómo explicar las cosas

Bosco no tiene formación técnica. Cuando menciones un concepto técnico por primera vez en
una conversación (migración de base de datos, política RLS, variable de entorno, rama de
git, worktree, caché, etc.), explica en una frase qué es y por qué importa aquí, antes de
usarlo con soltura. No hace falta repetir la explicación cada vez, solo la primera vez que
surge en una conversación.

## 6. Convenciones técnicas del repositorio

Todavía no hay código de producto en este repositorio (estamos en la fase de planificación
de los primeros hitos). En cuanto el Hito 1 cree la primera estructura de carpetas, stack y
comandos reales, esta sección se actualizará con:

- estructura de carpetas del monorepo;
- cómo instalar dependencias y arrancar cada aplicación (web y móvil);
- cómo ejecutar las pruebas automáticas;
- cómo crear y aplicar una migración de base de datos;
- convenciones de nombres y de commits.

Hasta entonces, la referencia de arquitectura vigente es la Especificación Maestra §151–155
(stack acordado y principios técnicos) y `docs/PLAN-H1-H2.md` (estructura propuesta para los
hitos activos).

## 7. Idioma

El producto es en español. La documentación de este repositorio (PRD, ROADMAP, este
archivo) se escribe en español, igual que las conversaciones con Bosco. Los nombres de
código (variables, tablas, funciones) pueden ir en inglés siguiendo la convención habitual
de programación, salvo que el propio dominio del negocio use un término en español que no
tenga una traducción natural y sea mejor conservarlo (p. ej. `menu_diario`).
