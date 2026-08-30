> **Nota del 30/08/2026:** Bosco subió una versión nueva y definitiva de `CLAUDE.md`,
> `docs/PRD.md` y `docs/ROADMAP.md`, que manda sobre lo que este archivo diga. El
> ROADMAP nuevo ya trae su propia descripción detallada de cada hito, así que este
> documento ha quedado en gran parte redundante — se conserva por trazabilidad de cómo
> se planificó el Hito 1 original, no como plan vigente. Antes de seguir cualquier
> instrucción de aquí, comprueba que no contradiga al PRD o al ROADMAP nuevos; si
> contradice, gana el documento nuevo.

# Plan detallado — Hito 1 y Hito 2

Este documento es el plan de trabajo de los dos primeros hitos de la Fase 1 (ver
`docs/ROADMAP.md`). Es un documento **vivo**: cuando H1 y H2 estén cerrados y aprobados,
este archivo se reemplaza por el plan de los hitos siguientes (H3 en adelante), que se
escribirá cuando le toque, no antes.

**Todavía no hay código de producto en el repositorio.** Este documento describe qué se va
a crear, no lo crea. Se empieza a escribir código solo cuando Bosco dé el visto bueno a
este plan.

---

## 0. Conceptos que van a aparecer en este plan

- **Monorepo**: un único repositorio de código que contiene varios proyectos relacionados
  (aquí: la web, la app móvil, y código compartido entre ambas) en vez de un repositorio
  separado para cada uno. Se elige esto porque web y móvil van a compartir bastante lógica
  (permisos, reglas de negocio) y es más fácil mantenerla sincronizada en un solo sitio.
- **Variable de entorno**: un valor de configuración (una clave de acceso, una URL de la
  base de datos) que no se escribe directamente en el código, sino que se guarda fuera
  (en un archivo `.env` que nunca se sube al repositorio) y cambia según dónde se ejecute
  la aplicación (tu ordenador, pruebas, producción real).
- **Migración**: un archivo que describe **un cambio concreto** en la estructura de la base
  de datos (por ejemplo, "crear la tabla de espacios"), numerado y guardado en el
  repositorio. En vez de modificar la base de datos a mano, se aplican migraciones en
  orden — así cualquier entorno (tu ordenador, producción) puede llegar exactamente a la
  misma estructura, y queda un historial de qué cambió y cuándo.
- **Política RLS (Row Level Security)**: una regla que se define en la propia base de datos
  y que dice, por ejemplo, "de la tabla de establecimientos, un usuario solo puede ver las
  filas cuyo `space_id` coincide con un espacio al que pertenece". Aunque hubiera un fallo
  en el código de la aplicación, la base de datos seguiría bloqueando el acceso indebido.
  Es la barrera de seguridad "de última línea" que exige la Especificación Maestra §134.
- **CI (integración continua)**: un proceso automático que se ejecuta cada vez que se sube
  un cambio al repositorio, y que comprueba que nada se ha roto (que el código compila, que
  las pruebas automáticas siguen pasando) antes de dar por bueno el cambio.
- **Entorno (dev / test / producción)**: copias separadas de la aplicación y de la base de
  datos. "Dev" es donde se prueba mientras se construye, "test" es donde corren las pruebas
  automáticas, "producción" es la real, con datos reales. Nunca se mezclan.

---

## 1. Decisiones de este plan que tomo yo, y por qué

Estas son decisiones de **implementación técnica**, no de producto, así que las tomo yo y
te las explico — dime si alguna no te convence:

1. **Gestor de paquetes y monorepo**: `pnpm` con "workspaces" (la función nativa de pnpm
   para gestionar varios proyectos en un repo). No añado Turborepo (una herramienta de
   caché de builds) todavía — con dos aplicaciones es innecesario; se puede añadir más
   adelante si los tiempos de compilación se vuelven un problema.
2. **Inicio de sesión en H1**: solo con correo y contraseña. La Especificación Maestra
   (§7.2) también pide inicio de sesión con Google y con Apple — los añado en un hito
   posterior de la Fase 1, porque configurarlos requiere crear aplicaciones en Google Cloud
   y en Apple Developer, un paso de infraestructura aparte que no bloquea poder demostrar
   "una persona se registra y entra".
3. **Alcance del alta de espacio en H2**: la Especificación Maestra (§9) describe un
   asistente de 10 pasos (datos, logo, horario, impuestos, planes...). En H2 solo cubro
   nombre del espacio y zona horaria — lo mínimo para que exista el espacio y puedas
   entrar en él. El resto de pasos del asistente (planes, horario laboral, impuestos)
   pertenecen a hitos donde esa información ya hace falta de verdad (H4 en adelante).
4. **Envío de invitaciones en H2**: como todavía no tenemos cuenta de Resend creada, la
   invitación a un miembro del equipo en H2 genera un enlace que puedes copiar y enviar tú
   mismo (por WhatsApp, correo, lo que sea), en vez de mandarse un correo automático. El
   envío automático por correo se activa en cuanto exista la cuenta de Resend, sin cambiar
   cómo funciona la invitación por dentro.

Si quieres que cambie cualquiera de estas cuatro decisiones antes de empezar, dímelo ahora.

---

## 2. Hito 1 — Cimientos técnicos

### Objetivo

Que exista el esqueleto del proyecto (web + móvil + base de datos) y que una persona pueda
registrarse e iniciar sesión de verdad, en el navegador y en el móvil. Sin restaurantes, sin
solicitudes, sin nada de negocio todavía — es la base sobre la que se construye todo lo
demás.

### Evidencia que enseñaré al cerrar este hito

- Salida real de los tests automáticos (en verde).
- Captura de pantalla del registro e inicio de sesión funcionando en la web.
- Captura de pantalla (o grabación) del mismo flujo funcionando en la app móvil, en un
  simulador o en tu teléfono.
- Confirmación de que el flujo de CI (comprobación automática) se ejecuta correctamente al
  subir un cambio.

### Tareas

1. Crear la estructura del monorepo (carpetas, gestor de paquetes, configuración común de
   TypeScript y de estilo de código).
2. Crear el proyecto Supabase de desarrollo (usando tu cuenta ya existente) y activar
   Supabase Auth.
3. Crear la aplicación web mínima (Next.js) con páginas de registro e inicio de sesión
   conectadas a Supabase Auth.
4. Crear la aplicación móvil mínima (Expo) con las mismas dos pantallas, conectadas al
   mismo proyecto Supabase.
5. Configurar las variables de entorno de ambas aplicaciones (sin subir ningún secreto real
   al repositorio).
6. Crear la primera migración de base de datos: una tabla `profiles` mínima (nombre, correo)
   que se rellena automáticamente al registrarse.
7. Configurar CI en GitHub Actions: que compruebe tipos de TypeScript y ejecute los tests en
   cada cambio.
8. Escribir las primeras pruebas automáticas (que el registro y el inicio de sesión
   funcionan de principio a fin).

### Archivos que se crearán, y por qué

| Archivo / carpeta | Por qué |
|---|---|
| `package.json`, `pnpm-workspace.yaml` | Definen el monorepo y sus proyectos internos |
| `.gitignore` | Evita subir dependencias instaladas, archivos temporales y secretos |
| `.env.example` | Plantilla de variables de entorno, sin valores reales, para que sepas qué hay que rellenar |
| `.github/workflows/ci.yml` | Define qué comprueba el CI en cada cambio |
| `apps/web/` (Next.js: `app/`, `next.config.ts`, `tsconfig.json`, páginas de login/registro) | La aplicación web |
| `apps/mobile/` (Expo: `app.json`, pantallas de login/registro) | La aplicación móvil |
| `packages/shared/` | Carpeta para código compartido entre web y móvil; en H1 queda casi vacía, se usará desde H2 |
| `supabase/config.toml` | Configuración del proyecto Supabase para desarrollo local |
| `supabase/migrations/0001_profiles.sql` | Primera migración: tabla de perfiles de usuario |
| Archivos de test junto a cada aplicación | Prueban que registro e inicio de sesión funcionan |

---

## 3. Hito 2 — Identidad multiempresa

### Objetivo

Que exista de verdad la estructura Espacio → Grupo → Establecimiento, con roles básicos y
con el aislamiento entre espacios funcionando (no solo en la pantalla, también en la base de
datos). Al final de este hito, tú puedes: crear el espacio de Restavor, darlo de alta con su
zona horaria, crear un establecimiento dentro, e invitar a alguien de tu equipo con un rol
— todo eso en web y en móvil.

### Evidencia que enseñaré al cerrar este hito

- Salida real de los tests automáticos, incluidos los que comprueban el aislamiento entre
  espacios (un usuario del espacio A no puede leer ni escribir datos del espacio B, ni
  siquiera pidiéndolo directamente a la base de datos).
- Capturas de pantalla (web y móvil) de: crear un espacio, crear un establecimiento dentro,
  invitar a alguien con un rol, y ver el selector de espacio cuando un usuario pertenece a
  más de uno.
- Explicación en lenguaje llano de las políticas RLS creadas, con el resultado de haber
  intentado "saltármelas" a propósito durante las pruebas, para que veas que no funciona.

### Tareas

1. Diseñar y crear las migraciones de: espacios, membresías de espacio con rol, grupos,
   establecimientos, membresías de establecimiento con rol.
2. Escribir las políticas RLS de aislamiento para cada una de esas tablas.
3. Construir la capa central de permisos en `packages/shared` (una única función de la que
   dependa toda comprobación de "¿puede este usuario hacer esto?"), para no repartir
   comprobaciones de permisos sueltas por cada pantalla — este es uno de los riesgos que
   señalé al principio (ver la sección de riesgos técnicos que te expliqué antes de este
   plan).
4. Construir el selector de contexto (si el usuario pertenece a un solo espacio, entra
   directo; si pertenece a varios, elige).
5. Construir el flujo mínimo de creación de espacio (nombre + zona horaria) y de alta de
   establecimiento (nombre + dirección básica).
6. Construir la invitación de miembros con rol (Administrador o Trabajador), con enlace para
   compartir manualmente mientras no exista envío de correo automático.
7. Escribir pruebas automáticas de aislamiento: crear dos espacios de prueba y confirmar que
   ningún dato se cruza entre ellos.
8. Construir las pantallas equivalentes en la app móvil.

### Archivos que se crearán, y por qué

| Archivo / carpeta | Por qué |
|---|---|
| `supabase/migrations/0002_spaces.sql` | Tabla de espacios y sus membresías con rol |
| `supabase/migrations/0003_groups_establishments.sql` | Tablas de grupos y establecimientos, con sus membresías |
| `supabase/migrations/0004_rls_policies.sql` | Las políticas de aislamiento entre espacios |
| `supabase/migrations/0005_invitations.sql` | Tabla de invitaciones pendientes con su rol asignado |
| `packages/shared/src/permissions/` | La capa central de permisos, compartida por web y móvil |
| `apps/web/app/(app)/...` (selector de espacio, crear espacio, establecimientos, invitar) | Pantallas web del hito |
| `apps/mobile/...` (pantallas equivalentes) | Pantallas móviles del hito |
| Tests de aislamiento (en `supabase/tests/` o junto a `packages/shared`) | Prueban que el RLS bloquea de verdad el acceso cruzado entre espacios |

---

## 4. Qué NO se hace en H1 ni en H2 (para que no haya sorpresas)

- Nada de Solicitudes, Trabajos ni Tareas todavía (eso es H3 en adelante).
- Nada de Finanzas, Menú Diario, Informes ni Integraciones (fases posteriores).
- El asistente de alta de espacio no incluye todavía planes, horario laboral ni impuestos.
- No hay inicio de sesión con Google ni con Apple todavía.
- No hay envío automático de correos todavía (se simplifica con enlace manual, ver
  decisión 4 de la sección 1).
- No se despliega nada a producción real en estos dos hitos: se trabaja y se enseña
  evidencia en entornos de desarrollo/pruebas.

## 5. Cómo lo reviso

Al cerrar H1 y, por separado, al cerrar H2, te enseño la evidencia descrita arriba y espero
tu aprobación explícita antes de seguir. Si en cualquier punto ves que algo no coincide con
lo que esperabas de Cuotly, dilo — se para y se ajusta, no se sigue construyendo encima.
