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

## CI

Cada cambio subido a GitHub ejecuta automáticamente tipado, lint, pruebas y
compilación (ver `.github/workflows/ci.yml`). No necesita credenciales de
Supabase para pasar: esas comprobaciones no requieren conectarse a la base
de datos real.
