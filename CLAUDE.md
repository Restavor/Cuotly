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
| `docs/DECISIONES.md` | Aclaraciones y reglas nuevas surgidas después de consolidar la Especificación Maestra. **Manda sobre lo que contradiga** a la Especificación Maestra, igual que ella manda sobre documentos anteriores | Entero, al empezar cualquier sesión |
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

Ver `README.md` para la estructura de carpetas y los comandos de instalación y arranque.
Resumen para esta sesión:

- Monorepo con pnpm workspaces: `apps/web` (Next.js 16 + TypeScript), `apps/mobile` (Expo
  SDK 57 + Expo Router), `packages/shared` (código compartido).
- Antes de ejecutar `pnpm typecheck` en `apps/web` en una copia nueva del repositorio (o
  después de borrar `.next/`), hay que generar primero los tipos de rutas de Next.js:
  `cd apps/web && npx next typegen`. Sin eso falla con `Cannot find name 'LayoutProps'`
  porque esos tipos se generan, no se guardan en el repositorio. El CI ya lo hace solo.
- **Next.js 16 tiene cambios importantes de nombres respecto a versiones anteriores**: el
  archivo que antes se llamaba `middleware.ts` ahora se llama `src/proxy.ts` y exporta una
  función `proxy`, no `middleware`. `cookies()`, `headers()`, `params` y `searchParams` son
  asíncronos (hay que hacer `await`). Antes de tocar código de `apps/web`, lee
  `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` si existe
  duda sobre una API concreta — es una versión más reciente que la que aparece en el
  entrenamiento de un modelo de lenguaje.
- Autenticación con Supabase Auth: `apps/web/src/lib/supabase/` (cliente de navegador y de
  servidor) y `apps/mobile/src/lib/supabase.ts` (cliente con almacenamiento del dispositivo).
- Variables de entorno: `NEXT_PUBLIC_*` en `apps/web/.env.local`, `EXPO_PUBLIC_*` en
  `apps/mobile/.env`. Ninguna de las dos se sube al repositorio.
- Tests: Vitest en `apps/web` y `packages/shared`; Jest (`jest-expo`) en `apps/mobile`. En
  `apps/mobile`, `@testing-library/react-native` 14.0.1 no funciona todavía con esta
  combinación de Expo SDK 57 / React Native 0.86 / React 19.2 (`render()` devuelve un objeto
  vacío en vez de lanzar un error o funcionar) — de momento la lógica de las pantallas se
  extrae a funciones puras y se prueba sin renderizar componentes (ver
  `apps/mobile/src/lib/validate-auth-form.ts` como ejemplo). Si en un hito futuro hace falta
  probar la interfaz de móvil renderizada, revisa primero si esa combinación de versiones
  ya se ha arreglado antes de perder tiempo depurándolo de nuevo.
- CI en `.github/workflows/ci.yml`: typecheck, lint, tests y compilación en cada cambio, sin
  necesitar credenciales de Supabase.
- Identidad visual "Emerald Control" (Especificación Maestra §146) ya aplicada como tokens
  de color: `apps/web/src/app/globals.css` y `apps/mobile/src/lib/theme.ts` — mismos valores
  en los dos sitios, no los dupliques con números distintos si los cambias.
- **Limitación de red de este entorno**: el proxy de salida de esta sesión de Claude Code
  bloquea el acceso directo a `*.supabase.co` (política del entorno remoto, no un fallo).
  Esto significa que no se puede verificar en vivo, desde esta sesión, que el registro o el
  inicio de sesión funcionan de verdad contra el proyecto real de Supabase — solo se puede
  comprobar que el código compila, pasa el tipado y pasa las pruebas con Supabase simulado
  (mock). La verificación en vivo la hace Bosco ejecutando `pnpm dev:web` en su propio
  ordenador, o se resuelve si en el futuro el entorno permite ese dominio.

## 7. Idioma

El producto es en español. La documentación de este repositorio (PRD, ROADMAP, este
archivo) se escribe en español, igual que las conversaciones con Bosco. Los nombres de
código (variables, tablas, funciones) pueden ir en inglés siguiendo la convención habitual
de programación, salvo que el propio dominio del negocio use un término en español que no
tenga una traducción natural y sea mejor conservarlo (p. ej. `menu_diario`).
