# Cuotly

Plataforma SaaS multiempresa para el mantenimiento web de restaurantes.
Creada por Restavor.

Antes de tocar nada, lee (en este orden): `CLAUDE.md`, `docs/PRD.md`,
`docs/ROADMAP.md`, `docs/DECISIONES.md`. `docs/ESPECIFICACION-MAESTRA.md` es
el documento completo de 180 secciones — se consulta por secciones, no
entero.

## Estructura del repositorio

```text
apps/
  web/       Aplicación web (Next.js)
  mobile/    Aplicación móvil (Expo — iOS y Android)
packages/
  shared/    Código compartido entre web y móvil
supabase/
  migrations/  Cambios versionados de la base de datos
docs/        Documentación del producto y del plan de trabajo
```

## Requisitos

- Node.js 20 o superior
- pnpm 9 (`corepack enable` si no lo tienes)
- Una cuenta de Supabase con un proyecto creado para Cuotly

## Puesta en marcha

```bash
pnpm install
```

Copia `.env.example` y rellena los valores reales de Supabase (Configuración
→ API en el panel de Supabase) en dos sitios:

- `apps/web/.env.local`
- `apps/mobile/.env`

Ninguno de los dos se sube al repositorio (están en `.gitignore`).

## Comandos

Desde la raíz del repositorio:

| Comando | Qué hace |
|---|---|
| `pnpm dev:web` | Arranca la web en `http://localhost:3000` |
| `pnpm dev:mobile` | Arranca el servidor de desarrollo de Expo (elige iOS, Android o web) |
| `pnpm -r typecheck` | Comprueba tipos de TypeScript en todo el repositorio |
| `pnpm -r lint` | Ejecuta el linter en todo el repositorio |
| `pnpm -r test` | Ejecuta las pruebas automáticas (unitarias) en todo el repositorio |
| `cd apps/web && pnpm test:e2e` | Ejecuta las pruebas end-to-end con Playwright |
| `pnpm build` | Compila todo lo compilable |
| `supabase start` | Arranca Supabase en local (necesita Docker instalado y en marcha) |
| `supabase db reset` | Recrea la base de datos local aplicando las migraciones desde cero |
| `supabase migration new <nombre>` | Crea un archivo de migración nuevo. Nunca se edita una ya aplicada |

La página `http://localhost:3000/styleguide` enseña todos los componentes base del
sistema de diseño (Emerald Control) en un solo sitio.

## Primer arranque (Hito 2): crear el espacio de Restavor

1. Entra con la cuenta cuyo correo coincide con `CUOTLY_OWNER_EMAIL` (§0 de la
   Especificación Maestra: el Propietario de Cuotly).
2. En Inicio verás el botón **Crear Restavor**. Solo lo ve esa cuenta — la
   base de datos lo comprueba de verdad, no solo la pantalla.
3. Se crea el espacio, sus tres planes y el servicio Menú Diario, todo en
   una única operación (`create_restavor_space()`).

## Login con Google

El botón "Continuar con Google" ya está construido, pero para que funcione
hace falta configurar un proyecto de Google Cloud y pegar sus credenciales
en el panel de Supabase → Authentication → Providers → Google. Sin eso,
Supabase devuelve un error controlado en vez de romper la página.

## Verificar el aislamiento entre espacios (CA-01, CA-02, CA-16)

`supabase/tests/hito2_permisos.sql` es un script real y repetible que
verifica esos tres criterios, más las reglas RN-DAT-03, RN-DAT-06 y
RN-EST-03, con consultas directas a la base de datos, simulando identidades
distintas. Cada comprobación lanza una excepción real si el resultado no es
el esperado — no es un listado de filas para comparar a ojo.

Se ejecuta automáticamente en cada push (`.github/workflows/ci.yml`, job
`rls-tests`): levanta una Supabase local desechable con Docker, aplica las
migraciones y corre el script con `psql -v ON_ERROR_STOP=1`; si una regla se
rompe, el job falla. También se puede ejecutar a mano — pegándolo en el SQL
Editor de Supabase, con `psql`, o con la herramienta `execute_sql` si tienes
el conector de Supabase activo en Claude Code. No modifica nada de forma
permanente: crea sus propios datos de prueba y los borra al final.

## Regenerar los tipos de TypeScript de la base de datos

Después de aplicar una migración nueva, los tipos en
`apps/web/src/lib/supabase/database.types.ts` hay que regenerarlos (con la
CLI de Supabase — `supabase gen types typescript` — o con la herramienta
`generate_typescript_types` si tienes el conector activo) y pegarlos ahí.
No se escriben a mano.

## CI

Cada cambio subido a GitHub ejecuta automáticamente tipado, lint, pruebas y
compilación (ver `.github/workflows/ci.yml`). No necesita credenciales de
Supabase para pasar: esas comprobaciones no requieren conectarse a la base
de datos real.
