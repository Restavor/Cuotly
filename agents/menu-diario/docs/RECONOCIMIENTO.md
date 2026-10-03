# Reconocimiento · Fase 0 del Agente Menú Diario

| | |
|---|---|
| Fecha | 02/10/2026 |
| Rama | `claude/gallant-mccarthy-nrf8u4` (reiniciada desde `origin/agents`, decisión A de Bosco) |
| Base de pruebas | "Restavor pruebas" (`bnucqykimngjwcrlpmsm`). Producción ("Cuotly", `mcajbfxhkxtdhjoyrqha`) **no se ha tocado** |
| Estado | **Incompleta, pendiente de Bosco** (actualizado el 03/10/2026, ver la sección siguiente). Falta el trabajo en LandingSite (preguntas 1 a 7 de PRD 9.3) y el visto bueno. Bar Demo ya está listo |

---

## Actualización del 03/10/2026 (respuestas de Bosco al §7)

Bosco contestó a los seis puntos del §7 y, después, a lo que quedó bloqueado. Estado:

| § 7 | Respuesta de Bosco | Estado a 03/10/2026 |
|---|---|---|
| 1 LandingSite | Cuenta propia para el agente (decisión 113). Es un **correo nuevo y vacío, con el que inició sesión en LandingSite usando Google** | **Riesgo de la cláusula 6(ix) sin resolver** (una cuenta propia solo protege la de Bosco). **Pendiente y bloqueante:** la cuenta está vacía, así que **no ve el sitio de Restavor** hasta que Bosco la invite desde su cuenta principal; y entrar "con Google" desde aquí es la peor vía (ver "Cómo conectar LandingSite") |
| 2 Página de pruebas | "Arreglado" | **Confirmado: responde 200** en `https://www.restavor.com/pruebas-agente-menu` (con anti-caché). Ver "La página de pruebas" |
| 3 Bar Demo | Permiso concedido | **Hecho entero** con la opción A (ver "Hecho en Restavor pruebas") |
| 4 Decisión de crear el agente | "Vale" | Decisión 112 en `docs/DECISIONES.md`, `CLAUDE.md` y nota en RN-CRE-25 de `docs/PRD.md` |
| 5 Reparto de trabajos | "Ok" a la opción (ii) | Decisión 114. El diseño exacto se propone en la Fase 2 y se aprueba antes de escribir la migración |
| 6 Preguntas 1 a 7 de LandingSite | Bosco entrará con la cuenta del agente | Pendiente: ver "Cómo conectar LandingSite" |
| Menú Diario para Bar Demo | **Opción A** | Hecho: contratado con la función de la app y pago de demostración registrado |

### La página de pruebas (comprobada el 03/10/2026, solo lectura)
- `https://www.restavor.com/pruebas-agente-menu` → **200**. Título "Página de pruebas · Menú del día", texto "Página interna de Restavor para probar la publicación automática del menú diario. No es un restaurante real", `<meta name="robots" content="noindex, nofollow">`. Cabecera `x-landingsite-site-id: LS-onmfye544q` (la misma que la portada: es el mismo sitio que la web real de Restavor).
- Tiene **3 imágenes**; la del menú es la **foto de archivo `/assets/provider/istock/2255959062.jpg` con `alt="Menú del día"`**. Ese texto alternativo es el marcador estable que propone el PRD (9.3-7). Las otras dos son subidas del propio sitio (`/assets/uploads/0c0495e1-…/…webp`).
- **Sí aparece en `sitemap.xml`** (86 URL; ayer 85), aunque está en `noindex`. No cuelga del menú, pero la dirección es descubrible. Solo existe en español (`/es/pruebas-agente-menu` da 404).
- Caché de la página: `public, max-age=60` (ayer, 300). Para verificar una publicación hay que contar con hasta 1 minuto de retraso.
- La imagen que sustituirá el agente es una **foto de archivo de LandingSite**, no un PNG subido: al cambiarla se sube un archivo nuevo a `/assets/uploads/…`.

### Hecho en "Restavor pruebas" (con el permiso de Bosco)
Todo por las funciones de la propia app y actuando como **`owner@cuotly.test`** (Elena Ruiz, administradora del espacio demo con `manage_clients` y `manage_requests`; el mismo actor que el sembrado), **no** con la cuenta real de Bosco. Script reproducible: `agents/menu-diario/sql/bar-demo-pruebas.sql`.
1. **Plataforma y dirección** de Bar Demo (`d4000000-…-0001`): `web_platform = landing_site`, `website_url = https://www.restavor.com/pruebas-agente-menu` (antes nulos). Por `set_establishment_data`, la única puerta (un UPDATE directo lo rechaza el disparador `establishments_guard_data`).
2. **Menú Diario contratado** con `create_service_subscription`: una suscripción de servicio activa, una **permanencia de 3 meses** y un **cobro de 277,09 € (229 € + IVA)** que vencía el 10/10. El precio es el del sembrado demo (anterior a la decisión 85, que fija 199 €): no se corrigió.
3. **Pago de demostración** de ese cobro por `register_payment` ("Transferencia de demostración", 27.709 de 27.709 céntimos), como hace el sembrado con el plan de Bar Demo. Bar Demo no queda con deuda pendiente.
4. **Plantilla de publicar** "Clásica" (`classic`, fondo `#FFFFFF`, texto `#1F2937`, acento `#145C4E`, cabecera "Bar Demo", pie "IVA incluido · Pan y bebida incluidos", con precio). Consume la plantilla incluida de publicar de Bar Demo (RN-CRE-23: no se puede crear otra incluida aunque se archive esta).
5. **Un menú `daily`** "Menú del día" para el **04/10/2026**, en **borrador**, con 1 versión (primeros: Ensalada de la huerta, Caldo gallego; segundos: Merluza a la gallega, Carrilleras al vino tinto; postres: Tarta de Santiago, Fruta de temporada; "Vino de la casa o agua"; 14,50 €; "Pan incluido"). **No se preparó ni se pidió publicar**, para no disparar asignación ni avisos. Los platos son los del menú de prueba de Magariños (solo el texto; Magariños no se tocó).

**Comprobado** (consulta de auditoría acotada a lo creado desde las 09:00 UTC del 03/10): siete apuntes de `audit_log`, todos del actor Elena (`subscription.service_created`, `charge.issued`, `payment.registered`, `menu_template.created`, `menu_template.design_updated`, `menu.created`, `menu.version_saved`), **0 avisos nuevos** en `notifications`, **1 evento de menú** (creación en borrador), Bar Demo sigue `active`, con Menú Diario. Antes, a las 08:54 UTC, el apunte `establishment.data_changed` de la plataforma y la dirección.
**No comprobado:** una comparación de recuentos de todas las tablas antes/después (Bosco rechazó esa consulta y no se repitió); solo se ha verificado lo anterior.
Un **resembrado** del espacio demo deshace todo esto (Bar Demo conserva su id y `EST-0001`): hay que relanzar el script a mano.

### PNG de prueba
`docs/menu-prueba-bar-demo.png` (1240 × 1754) se **regeneró a partir del menú real de Bar Demo en la base** (4 de octubre, plantilla "Clásica"), con el mismo código de la web (`buildMenuDocument` + `renderMenuPng`, fuera de Next). Sustituye al anterior (que usaba datos de Magariños con cabecera "Bar Demo"). Dos renders seguidos dan los mismos bytes (sha256 `04168135…`). Sigue sin comprobarse que coincida píxel a píxel con una descarga hecha desde la web desplegada (§2.1).

### Cómo conectar LandingSite (pendiente de Bosco)
- Cuentas "con Google" no tienen contraseña de LandingSite. Opciones, de mejor a peor:
  1. **(Recomendada) Ponerle contraseña de LandingSite** a la cuenta del agente: desde el login con ese correo, "He olvidado mi contraseña" (o ajustes de cuenta) si LandingSite lo permite; es la pregunta 1 del PRD (9.3). Después, `LANDINGSITE_EMAIL` y `LANDINGSITE_PASSWORD` como variables del entorno en la nube (menú del entorno en la barra de título de la sesión → Edit), y **una sesión nueva** (esta no las recoge). **Nunca por el chat.**
  2. **Entrar con Google desde aquí: no recomendado.** Exigiría guardar la **contraseña de la cuenta de Google** (más sensible que la de LandingSite), y Google suele bloquear o pedir verificación a inicios de sesión desde un entorno nuevo y con navegador automatizado, y no hay pantalla donde Bosco pueda resolverlo.
  3. **Si LandingSite no admite contraseña:** Bosco inicia sesión una vez en **su propio navegador** (plan del PRD, 9.4, `npm run agente:login`, es de la Fase 1 y necesita su ordenador) y se guarda solo la sesión de `landingsite.ai`, cifrada. No sirve en esta sesión de nube.
- **Antes de nada, invitar a esa cuenta al sitio de Restavor** desde la cuenta principal de Bosco (colaborador o similar). Una cuenta nueva y vacía no ve ningún sitio. Es la pregunta que decide si todo esto funciona; si LandingSite no permite invitar, la vía de la cuenta propia no sirve y vuelve a plantearse (plan B del PRD, P3).
- Red: hay que permitir `imagedelivery.net` y `assets.ls-assets.com` (bloqueados el 03/10; `app.landingsite.ai/login` y `www.landingsite.ai` sí responden). Puede que aparezcan más al probar el editor.
- Cautelas: la cuenta la crea Bosco **a mano** (la cláusula 6(ix) prohíbe a scripts crear cuentas), y el trabajo en LandingSite será **mínimo y lento** (pocas peticiones, como una persona).

### Qué necesito de Bosco ahora
1. **Invitar la cuenta del agente al sitio de Restavor** y decir si LandingSite lo permitió.
2. **Elegir cómo se conecta** (opción 1 de arriba, si LandingSite deja poner contraseña) y, si es esa, guardar `LANDINGSITE_EMAIL` y `LANDINGSITE_PASSWORD` en el entorno + permitir los dos dominios + abrir una **sesión nueva** en la rama `claude/gallant-mccarthy-nrf8u4`.
3. **¿Dónde vive Bar Demo a largo plazo?** Seguir con el script a mano tras cada resembrado, o llevarlo a `supabase/seed/espacio-demo.sql` (toca la carpeta de sembrados y reconstruye la base al subirlo a `agents`).
4. **Visto bueno de la Fase 0** cuando se hayan respondido las preguntas 1 a 7 de LandingSite (PRD §14).

---

## 0. Lo importante, en cristiano

1. **Hay que parar antes de la Fase 1.** Las condiciones de uso de LandingSite prohíben usar "software, agentes automatizados o scripts" para hacer peticiones al servicio (§4.1). Un robot que maneje el editor de LandingSite cae de lleno en eso. El PRD (9.3, pregunta 8) dice que en este caso se **para y se avisa a Bosco**. Esto no se resuelve en código: lo decide Bosco (pedir permiso por escrito a LandingSite, o ir al plan B del PRD, P3).
2. **La página de pruebas no existe de cara al público.** `https://www.restavor.com/pruebas-agente-menu` devuelve 404, también con `/es/` y `/en/`. O no está publicada, o la dirección es otra (§4.2).
3. **Bar Demo no sirve todavía como restaurante de pruebas.** No tiene menús, ni plantilla de menú, ni plataforma web, ni dirección web. Los dos únicos menús de la base de pruebas son de Magariños, que apunta a una web real (§3).
4. **El agente "sin especialidades" no queda fuera del reparto normal**, como cree el PRD. Solo queda fuera del reparto de **menús**. En el reparto de trabajos y tareas de mantenimiento sí entra, y además vería finanzas e informes de sus restaurantes (§2.8).
5. **El propio `CLAUDE.md` dice que este agente "no existe todavía y no se simula"** (§5). Es una decisión de Bosco que hay que dejar escrita antes de construir nada.
6. **Lo bueno:** el PNG se puede generar con el mismo código de Restavor web fuera de Next y sale idéntico byte a byte entre dos ejecuciones; el robot puede usar las cuatro funciones que el PRD cita; y la base de pruebas está limpia y sin Edge Functions.

---

## 1. Qué se ha tocado y qué no

| Dónde | Qué | Estado |
|---|---|---|
| "Restavor pruebas" | **Solo lecturas** (`select`, listados). Ni tablas, ni migraciones, ni datos, ni Edge Functions | Sin cambios (§3.1) |
| "Cuotly" (producción) | Nada. Ninguna llamada | — |
| restavor.com / LandingSite | **Solo peticiones públicas de lectura** (portada, mapa del sitio, `robots.txt`, la ruta de pruebas, las condiciones de uso). **No se ha entrado en LandingSite y no se ha cambiado nada** | Sin cambios |
| Edge Function desechable | **No se ha creado ninguna** (decisión de Bosco: la prueba de HTML queda "no comprobada") | Nada que borrar |
| Repositorio | Solo `agents/menu-diario/` (el PRD, este informe y el PNG de prueba). La rama se movió a `origin/agents` | Ver `git status` |

Nota sobre la red: al principio el entorno bloqueaba `www.restavor.com`, `landingsite.ai` y el proyecto de Supabase por HTTP; se esperó a que Bosco ampliara la red, no se rodeó.

---

## 2. Lo que se pedía averiguar en el código de Restavor web

Las referencias `archivo:línea` salen de una lectura del código (no de ejecutarlo), salvo donde se dice lo contrario.

### 2.1 Cómo se genera el PNG del menú
- Se genera **en el servidor**, con `renderMenuPng` (`apps/web/src/services/menu-image.tsx:126`), que usa `ImageResponse` de `next/og` (JSX → SVG → PNG). El PDF es una página A4 con ese mismo PNG dentro (`pdf-lib`).
- El modelo de datos (qué texto, qué secciones, el precio como "14,50 €") lo construye `buildMenuDocument` (`apps/web/src/core/menu-render.ts:110`), TypeScript puro sin dependencias.
- Tamaño: **1240 × 1754 px** (A4 a 150 ppp, `menu-image.tsx:25-26`). El "150 ppp" es nominal: no hay código que escriba metadatos de ppp.
- Quién llama: solo la ruta `GET /espacios/[slug]/restaurantes/[id]/menu-diario/[menuId]/descargar?formato=png|pdf` (`apps/web/src/app/espacios/[slug]/restaurantes/[id]/menu-diario/[menuId]/descargar/route.ts`). `register_menu_download` se llama ahí (línea 66) y en ningún otro sitio (la app móvil no lo usa).
- **Autenticación de esa ruta: solo cookie de sesión de Supabase** (`createClient()` con `@supabase/ssr`). **No acepta `Authorization: Bearer`**. Un robot con email y contraseña no puede llamarla con un token; tendría que reproducir la cookie o entrar con Playwright y pulsar "Descargar PNG" (como prevé el PRD, 6.2-2).
- **Efecto secundario:** descargar escribe en `menu_downloads` y `audit_log`, y si quien descarga es el asignado y el menú está en `assigned` o `reviewing`, lo pasa a `ready_to_publish`. Por eso en esta fase **no se ha llamado a la ruta ni a la RPC**.
- La ruta no lee `allergen_note`, así que **el PNG no dibuja la nota de alérgenos**.
- **Prueba hecha (ejecutada, no solo leída):** copiando `menu-render.ts` y `menu-image.tsx` a una carpeta temporal fuera del repo, con las mismas versiones (`next` 16.3.3, `react` 19.2.8, Node 22), `renderMenuPng` funciona **sin servidor Next** y dos renders seguidos dan **los mismos bytes** (sha256 `b2340ca7…`). Es la base para la Fase 3 (PNG idéntico al de descarga manual). Pendiente: comprobar que coincide también con una descarga real hecha desde la web desplegada (otra máquina, otro ICU/fuentes podrían cambiar píxeles).

### 2.2 Cómo se dispara `queue-runner`
- `apps/web/src/services/queue-runner.ts` es el proceso de la cola (trabajos programados, SLA, correo y push). Se dispara con **cron de Vercel** (`apps/web/vercel.json`): `0 7 * * *` y `0 19 * * *` UTC, sobre `GET /api/cola` (`apps/web/src/app/api/cola/route.ts`, `maxDuration = 60`).
- Autenticación del endpoint: `Authorization: Bearer <CRON_SECRET o QUEUE_RUNNER_SECRET>` (`route.ts:79-90`), con la `service_role`.
- No hay `pg_cron`, `pg_net`, Edge Functions ni GitHub Actions que lo disparen. `.github/workflows/` solo tiene `ci.yml` y `pruebas-supabase.yml`.
- **Conclusión para el despachador del PRD (5.1-2):** dos pasadas al día **no sirven** de reloj para "publicar a las 17:00" ni "en menos de 1 minuto". Habrá que activar `pg_cron`/`pg_net` (disponibles en "Restavor pruebas" pero **sin instalar**) o hacer otra cosa. En el plan Hobby de Vercel las pasadas reales llegan a las 07:13 y 19:51 (`docs/DESPLIEGUE-VERCEL.md`).

### 2.3 Cómo se envían los emails con Resend
- Adaptador `createResendTransport` (`apps/web/src/services/queue-gateway.ts:269`): `fetch` a `https://api.resend.com/emails` con `{from, to, subject, text}`. **Solo texto plano**, sin HTML ni imágenes ni botones. El email de aprobación del PRD (imagen + botón) **no se puede hacer con el adaptador actual**.
- Remitente: `RESEND_FROM` (por defecto `Restavor web <avisos@cuotly.com>`). Si está mal escrita no sale nada (ya pasó: 11 días sin correos del 10 al 21/09/2026).
- **No existe envío inmediato de correo**: todo sale por la cola de las dos tandas. Solo el push es "al momento" (`sendPushNow`, `queue-runner.ts:662`).
- En "Restavor pruebas" no hay clave de Resend (`docs/agents/PRUEBAS.md`): los correos se quedan en cola y no salen.

### 2.4 Cómo se comprueban sesión y rol en las rutas de Next.js
- No hay un ayudante único de rol. Patrón: `createClient()` + `supabase.auth.getUser()`, y la autorización se **delega en la base de datos** (RPC como `has_capability` o `is_space_member`, más RLS). `apps/web/src/proxy.ts` (Next 16) solo refresca la sesión y exige el segundo paso (`aal2`), no autoriza.
- Propietario o administrador: capacidades como `manage_requests` o `contact_cuotly` (`has_capability_as`, `supabase/migrations/20260927000155_la_app_se_llama_restavor_web.sql`, ~1571-1640). `manage_space` es solo propietario.
- No hay ninguna `route.ts` que hoy exija propietario o administrador: la página `/agente-menu/aprobar` del PRD sería la primera.

### 2.5 Convención para exponer funciones
- `supabase/config.toml`: `[api] schemas = ["public","graphql_public"]`. **Todas las funciones van en `public`**; no hay ningún esquema propio no expuesto ni `create schema` en las migraciones.
- Patrón de uso con sesión: `security definer`, `set search_path = public`, `revoke all … from public, anon`, `grant execute … to authenticated`. Patrón interno: `revoke all … from public, anon, authenticated` + `grant execute … to service_role` (regla dura de `CLAUDE.md`).
- Esto **choca con PRD 5.1-1 y 8** (esquema `agente_menu` con RLS pero sin políticas): `CLAUDE.md` exige `space_id NOT NULL`, RLS **con políticas explícitas** y el disparador de solo lectura en soporte. Según el propio PRD (§0), en convenciones manda `CLAUDE.md`.

### 2.6 `assert_establishment_service_running`
- Definición viva (comprobada en la base): mira **solo `establishments.status`**. Lanza error con `paused` y `suspended` ("detenido por impago"), `read_only` y `archived`. Dejan pasar `configuring`, `active` y `ending`.
- Se aplica en `request_menu_publication`, `mark_menu_published` y al republicar con `save_menu_version`. **No** se aplica en `report_menu_publication_error`, `register_menu_download` ni `assign_menu_publication`.
- La comprobación previa del PRD (6.2-6) debe copiar esa lista de estados, no solo "impago".

### 2.7 ¿`record_menu_event` admite `assigned → pending_assignment`?
- **Sí lo admite**, porque no valida transiciones (definición viva): inserta el evento y hace `update menus set state = p_to_state`. No hay CHECK de transiciones ni disparadores de estado en `menus`, `menu_events` ni `menu_publications` (solo los de solo lectura/soporte).
- Pero **no existe nada que devuelva un menú a `pending_assignment`**: `agente_menu_devolver` tendría que poner `assigned_to = null` y `assignment_mode = null` a mano (el CHECK admite null) y llamar a `record_menu_event`.
- **Aviso que puede perderse:** si el menú ya había notificado `menu_publication_requested`, la clave de deduplicación `(destinatario, clave)` hace que un segundo aviso no se emita. Habría que llamar a `emit_notification` con una clave nueva.
- La máquina de estados de `apps/web/src/core/menu-states.ts` y la afirmación "el servidor la hace cumplir" (`docs/PRD.md:1397`, RN-MEN-09) **no son ciertas**: es solo un dato en TypeScript, y `assigned → pending_assignment` no está en él.

### 2.8 Efectos de dar de alta un miembro nuevo
- No existe `invite_member` ni `create_worker` en la base. El alta es una fila en `space_memberships` (`role` `worker`, `status` `active`). En la app: la acción `inviteMember` (`apps/web/src/app/espacios/actions.ts:43-100`, solo el propietario) y `completeInvitationSignup` crea la cuenta con contraseña. En pruebas, el patrón es SQL directo como en `supabase/seed/espacio-demo.sql`.
- **Límite de plazas:** el trigger `space_memberships_guard_cuotly_limit` cuenta todas las membresías activas. Con `spaces.cuotly_plan` nulo (el espacio de Restavor) no hay límite; con `pro` son 5 + extras. **No hay cobro automático por plaza** y el agente contaría como 1 usuario interno.
- Tablas que hay que rellenar después: `worker_establishments` (restaurantes autorizados), `worker_specialties` y, si se quiere, `worker_availability`. Se pueden crear con **0 especialidades** (no hay restricción).
- **Hallazgo principal:** con 0 especialidades el agente queda fuera del reparto de **menús** (`menu_candidate_ids` exige `general` o `daily_menu`), **pero no del de trabajos ni de tareas**. `is_eligible_job_candidate` solo mira especialidades si el trabajo exige una (`required_specialty`, nulo por defecto). Resultado: un trabajador activo, autorizado en el restaurante y disponible es candidato de todo trabajo sin especialidad exigida, y como tiene carga 0 sale **el primero** en la pantalla "Asignar" (`list_job_candidates`) y cuenta en `auto_assign_job`. `list_task_candidates` ni siquiera filtra por disponibilidad.
- **No se puede evitar sin tocar el reparto:** el PRD exige que esté en `worker_establishments`, y eso es lo que activa su candidatura. Mitigación parcial: marcarlo `worker_availability.available = false` (lo excluye de `job_candidate_ids`, no de las tareas; el robot no mira esa tabla).
- **Visibilidad no mencionada en el PRD:** al estar autorizado en un restaurante, ve sus datos financieros, solicitudes y trabajos, y puede preparar, aprobar y enviar informes (RN-REP-31, migración 138).
- Otros efectos: aparece en los listados del equipo y en el paso de onboarding `first_worker`; no suma carga de puntos (no cuenta menús); sus publicaciones cuentan en las métricas de menús de los informes; cada `menu_assigned` avisa (campana, correo y push) a **todos** los propietarios y administradores y encola un correo al buzón del agente.
- **Si se retira al agente con menús asignados**, esos menús quedan atados a él (`end_membership_consequences` no toca `menu_publications` y `assert_can_write_menu_publication` no exige membresía activa).

### 2.9 ¿Sirve HTML una Edge Function en el dominio por defecto de Supabase?
**No comprobado.** Bosco decidió no hacer la prueba real. No cambia el diseño: el PRD ya pone la página de aprobación en Next.js. Si se quisiera confirmar: una función mínima con `verify_jwt` desactivado, abrirla en el navegador, y borrarla desde el panel (yo no tengo herramienta para borrar Edge Functions).

---

## 3. La base "Restavor pruebas"

### 3.1 Línea base (consultada el 02/10/2026, solo lectura)
| Dato | Valor |
|---|---|
| Migraciones aplicadas | 168 (última `20261002000168`) |
| Tablas en `public` | 151, **0 sin RLS** |
| Filas en `audit_log` | 229 |
| Edge Functions | **0** |
| `pg_net` y `pg_cron` | disponibles, **no instaladas** |
| Menús / publicaciones / versiones | 2 / 1 / 2 |
| Membresías de espacio | 6: `info@restavor.com` es propietaria en dos espacios (`restavor` y `demo`), 2 administradores (`admin@cuotly.test`, `owner@cuotly.test`) y 2 trabajadores (`trabajadora@cuotly.test`, `trabajador2@cuotly.test`) con especialidad `general`, ambos autorizados en Magariños |

Esta misma consulta debe dar lo mismo al final de la fase.

### 3.2 Datos de menús (todo es de Magariños)
- Establecimientos: Bar Demo (`d4000000-…-001`) con `web_platform` y `website_url` **nulos**; **Magariños** (`d4000000-…-003`) con `web_platform = landing_site` y `website_url = https://www.magarinos.es` (web real, no usar).
- Menús: dos `daily` de Magariños, "Menú del día": 03/10/2026 en `pending_assignment` y 04/10/2026 en `draft`. Plantillas: solo las de Magariños ("Clásica" publicar, "Impresión").
- **Bar Demo no tenía ningún menú ni plantilla** (a 02/10). El requisito R3 del PRD **no estaba cumplido**; el 03/10 se cumplió (ver la actualización de arriba).
- Los trabajadores de pruebas (`trabajadora@cuotly.test`, `trabajador2@cuotly.test`) sí son candidatos humanos de menús (especialidad `general`), así que `request_menu_publication` asignaría solo si hay uno único; hay dos, por lo que el menú del 03/10 queda "sin asignar".

### 3.3 PNG de prueba para la web
`agents/menu-diario/docs/menu-prueba-bar-demo.png` (1240×1754). **No es una descarga literal de la base:** usa los platos, el precio y los colores del menú de Magariños del 03/10/2026 (leídos en solo lectura) pero con la cabecera **"Bar Demo"**, porque Bar Demo no tiene menú y la Fase 0 no permite escribir en la base. Se genera con el mismo código de la web (§2.1), con `buildMenuDocument` + `renderMenuPng`.

---

## 4. LandingSite

### 4.1 Pregunta 8: condiciones de uso (**PARAR**)
Fuente: `https://www.landingsite.ai/terms-of-service` (consultada el 02/10/2026). Sección 6, cláusula (ix), literal:

> "(ix) use software or automated agents or scripts to produce multiple accounts on the Services, or to generate automated searches, requests, or queries to (or to strip, scrape, or mine data from) the Services (provided, however, that we conditionally grant to the operators of public search engines revocable permission to use spiders to copy materials from the Site […])"

- Lectura honesta: la cláusula habla de agentes o scripts que generen "peticiones o consultas automatizadas" al servicio. Un robot Playwright que entra al editor de LandingSite, sube imágenes y pulsa "Publicar" es un agente automatizado que genera peticiones. **No es seguro que lo prohíban para este uso (no es scraping ni crear cuentas), pero tampoco hay una autorización.** No soy abogado: esto es una lectura de texto, no un dictamen.
- No he encontrado cláusulas sobre compartir credenciales ni sobre acceso programático autorizado. Hay una cláusula general de que las condiciones pueden cambiar a su discreción.
- Según el PRD, esto obliga a parar y avisar. Opciones para Bosco (ver §7): pedir autorización escrita al soporte de LandingSite, ir al plan B del PRD (P3: recuadro incrustado en la web que lea el menú desde Restavor web), o asumir el riesgo de que cierren la cuenta (la cuenta es **la única web publicada de Restavor**).
- Hacer el cambio **a mano** (una persona, sin robot) no entra en esa cláusula.

### 4.2 La página de pruebas
- `https://www.restavor.com/pruebas-agente-menu` → **404** (también `…/pruebas-agente-menu/`, `/es/…`, `/en/…`). No está en `sitemap.xml` (normal para una página oculta), y la propia web responde con la página "Page not found" de LandingSite.
- Posibles causas: la página existe en el editor pero **no está publicada**, o la dirección es otra, o no se ha creado todavía. **Hay un riesgo:** si solo existe en el editor, para verla pública habría que pulsar "Publicar", y eso podría publicar también cualquier otro cambio a medias de la web real (pregunta 6, sin responder).
- La web tiene versiones `/es/` y `/en/` (sitemap con ~80 URL, incluida `/es/menu-diario-restaurantes`), y cabecera pública **`x-landingsite-site-id: LS-onmfye544q`**. Ese identificador, visible sin iniciar sesión, **no sirve para la guarda de sitio del PRD (9.5)**, que habla de la URL del editor, pero confirma que cada sitio tiene identificador propio.
- Huellas de las páginas públicas **antes** de cualquier cambio (sha256, primeros 16 caracteres): portada `c175c8c79ce891de`, `sitemap.xml` `f7d84d338ea092c1`, `robots.txt` `1eff35548f3e1b8c`, página 404 `d0cdb400c627bbb4`. Sirven para comprobar después que no ha cambiado nada más (la portada puede variar por contenido dinámico; si difiere, se compara el texto visible).

### 4.3 Preguntas 1 a 7 de PRD 9.3
**Sin responder.** Requieren entrar en LandingSite con la sesión de Bosco (desde esta sesión en la nube no hay pantalla donde Bosco pueda iniciar sesión, y tampoco se piden contraseñas por el chat). Quedan **en espera de Bosco** y de que confirme lo de §4.1 y §4.2:

| # | Pregunta | Estado |
|---|---|---|
| 1 | ¿La cuenta de Google admite añadir contraseña? | Pendiente |
| 2 | ¿Qué cookies y orígenes mantienen la sesión (¿solo `landingsite.ai`?) | Pendiente |
| 3 | URL estable del editor e identificador del sitio en ella | Pendiente |
| 4 | Cómo se sustituye una imagen y si gasta ediciones de IA | Pendiente |
| 5 | ¿Se puede editar el texto alternativo? | Pendiente |
| 6 | Cómo se publica; ¿"Publicar" publica toda la web?; ¿avisa de cambios sin publicar? | Pendiente |
| 7 | Cómo localizar la imagen del menú en el editor y en la web pública | Pendiente |
| 8 | Condiciones de uso | **Respondida: ver §4.1** |

Regla acordada: Bosco hace los pasos a mano; **antes de cada "Publicar" me avisa y le doy el OK explícito**; solo se toca la imagen de la página de pruebas.

---

## 5. Contradicciones y puntos que chocan (PRD del agente ↔ `CLAUDE.md` ↔ código)

| # | Qué choca | Dónde |
|---|---|---|
| C1 | `CLAUDE.md` ("Decisiones que NO deben reaparecer"): *"el agente de IA que publicará al guardar no existe todavía y no se simula"* y `docs/PRD.md` RN-CRE-25. El PRD del agente lo construye. **Según `CLAUDE.md` hay que parar y preguntar.** Falta que Bosco lo apruebe y se registre en `docs/DECISIONES.md` y en `CLAUDE.md` (como se hizo con D-A a D-K en Restavor agents) | `CLAUDE.md`, `docs/PRD.md` |
| C2 | "El agente no tiene especialidades, así que el reparto normal no cambia" (PRD 3.5, D9). Es cierto para menús, **falso para trabajos y tareas** (§2.8) | PRD 3.5, D9 |
| C3 | Esquema `agente_menu` sin políticas (PRD 5.1-1, 8) frente a `CLAUDE.md` (RLS con políticas, `space_id NOT NULL`, disparador de soporte). Manda `CLAUDE.md` | PRD 5.1, 8 |
| C4 | `mark_menu_published` "es idempotente" (PRD 3.4): solo si el menú ya está `published`. **Publica la versión vigente en el momento de la llamada**, sin control de versión; todo el control de versión es del robot (PRD 6.2-6) | PRD 3.4 |
| C5 | `report_menu_publication_error` "(no desde `publication_error`)" (PRD 3.4): en la práctica, desde `publication_error` **no falla, devuelve en silencio**; desde `published` o `cancelled` sin publicación viva **sí lanza error** | PRD 3.4, 7.5 |
| C6 | `assign_menu_publication` solo registra evento si el menú está en `pending_assignment`; una reasignación `assigned → assigned` no deja evento y no avisa a quien pierde el menú (PRD 7.2 pide evento en cada reasignación) | PRD 7.2 |
| C7 | PRD 3.2 sugiere `assigned → reviewing → ready_to_publish`; en la práctica `reviewing` solo se alcanza desde `needs_information` | PRD 3.2 |
| C8 | PRD 7.4 (republicar): para un `daily` ya publicado, `save_menu_version` lo devuelve a `draft`; hay que volver a `prepare_menu` y `request_menu_publication`. Además `menus_one_daily_per_date` impide un segundo `daily` no cancelado el mismo día | PRD 7.4 |
| C9 | `menu_publish_by_at` y `menu_cutoff_at` no son columnas, son funciones derivadas (revocadas para `authenticated`). El robot las lee con `menu_deadlines(p_menu_id)` o `team_menu_queue.publish_by_at` | PRD 3.6, 7.5 |
| C10 | `team_menu_queue` no devuelve la versión del menú; hay que leerla de `menus` / `menu_publications` | PRD 3.4 |
| C11 | `menu_candidate_ids` también admite administradores con `can_perform_jobs` (sin autorización por restaurante) y **no mira las ausencias aprobadas** | PRD 3.5 |
| C12 | `allergens` (PRD 3.3) está en desuso desde la migración 102; importa `allergen_note`, que el PNG actual **no dibuja** | PRD 3.3 |
| C13 | `docs/PRD.md` RN-MEN-09 y `menu-states.ts` dicen que el servidor hace cumplir la máquina de estados: no es cierto (§2.7). No es del agente, pero afecta a cualquiera que se fíe | `docs/PRD.md:1397` |

---

## 6. Riesgos

| Riesgo | Gravedad | Comentario |
|---|---|---|
| Condiciones de LandingSite (6.ix): posible cierre de la cuenta que aloja **la única web de Restavor** | **Alta** | Decisión de Bosco antes de la Fase 1 (§7) |
| Dos pasadas de cola al día no sirven de reloj; `pg_cron`/`pg_net` aún no están activados | Alta (técnica, resoluble) | Fase 2 |
| El agente entra en el reparto de trabajos/tareas con prioridad (carga 0) y ve finanzas e informes | Media-alta | Hay que cerrarlo (p. ej. disponibilidad = no, o una restricción nueva), y eso puede obligar a tocar funciones existentes, que el PRD prohíbe |
| "Publicar" en LandingSite podría publicar cambios a medias de la web real | Alta (hasta que se conteste la pregunta 6) | Hasta entonces: nadie deja cambios sin publicar |
| PNG solo por cookie y escribiendo en la base; versión publicada = la vigente en ese instante | Media | Reproducir con Playwright o generar el PNG por otra vía idéntica (§2.1) |
| El email actual solo admite texto plano | Media | Hace falta HTML con imagen y botón: adaptador nuevo o ampliación |
| Menús atados al agente si se le retira del equipo | Media | La comprobación previa y `agente_menu_devolver` deben contemplarlo |
| Producción y pruebas comparten las mismas funciones; un error de migración no es reversible (`CLAUDE.md`: migraciones nuevas, nunca editar) | Media | Procedimiento ya existente de `pruebas-supabase.yml` |
| `pnpm-workspace.yaml` no incluye `agents/*` | Baja | Hay que añadirlo (o el paquete queda fuera de CI) |

---

## 7. Qué necesito de Bosco para la Fase 1

1. **Decidir qué hacer con las condiciones de LandingSite** (§4.1): (a) escribir a LandingSite pidiendo autorización expresa para automatizar el editor de tu propia cuenta y esperar respuesta; (b) pasar al plan B del PRD (P3), que no necesita entrar en el editor; (c) seguir asumiendo el riesgo. Recomendación: **(a) primero, con (b) como plan de reserva**, porque la cuenta aloja tu única web publicada.
2. **Aclarar la página de pruebas:** ¿existe en el editor? ¿Está publicada? ¿Cuál es la dirección exacta? Si no está publicada, hay que contestar antes la pregunta 6 (qué publica "Publicar") para no sacar cambios ajenos a la luz.
3. **Un restaurante de pruebas utilizable (R3):** Bar Demo necesita `web_platform = landing_site`, la dirección web de la página de pruebas, una plantilla de publicar y al menos un menú. Eso es escribir en la base de pruebas, así que necesito tu permiso expreso (la Fase 0 solo permitía una Edge Function).
4. **Registrar la decisión de crear este agente** (C1) en `docs/DECISIONES.md` y en `CLAUDE.md`, o decirme cómo quieres tratarla.
5. **Decidir cómo cerrar el reparto de trabajos al agente** (§2.8): opciones (i) dejarlo con disponibilidad "no" como parche, (ii) añadir una marca en el miembro que lo excluya de los repartos de trabajos (una migración nueva que modifica funciones de reparto, que el PRD prohíbe tocar), (iii) aceptar que aparezca. Recomendación: (ii), con tu OK explícito para la excepción.
6. **Completar las preguntas 1 a 7 de LandingSite** (§4.3) haciendo tú los pasos con mi guía, o con Claude Code instalado en tu ordenador (navegador visible de verdad), después de resolver el punto 1.
7. **Para fases posteriores** (no bloquean la 1): repositorio privado con Actions (R2), correo del agente (R4), copia desplegada de Restavor web contra pruebas (R5), Resend (R6), clave de Anthropic con tope (R7).

---

## 8. Qué no he podido comprobar
- Preguntas 1 a 7 de LandingSite (§4.3) y si **"Publicar" publica toda la web**.
- Si una Edge Function sirve HTML en el dominio por defecto (§2.9).
- Si el PNG generado fuera de Next coincide píxel a píxel con una descarga real de la web desplegada, y si el PNG lleva metadatos de ppp.
- La existencia real de la página de pruebas (§4.2).
- Las referencias `archivo:línea` de §2 son de lectura del código; no se han ejecutado los tests SQL contra la base.

---

## 9. Comprobaciones de `CLAUDE.md` (`pnpm typecheck && pnpm lint && pnpm test`)
Esta fase solo añade un `.md` y un `.png`, no código; se pasaron igualmente sobre el árbol completo (`origin/agents` + esta carpeta).

| Comprobación | Resultado |
|---|---|
| `pnpm lint` | Pasa (salida 0) |
| `pnpm typecheck` | `apps/mobile` y `packages/shared` pasan. `apps/web` falla en la primera pasada con `Cannot find name 'LayoutProps'` (`src/app/layout.tsx:17`): es un tipo global que genera Next. Tras `next typegen` (escribe en `.next`, ignorado por git) `tsc --noEmit` pasa (salida 0). **No es un fallo de esta fase**, pero ojo: el comando tal cual falla en un clon limpio sin generar tipos |
| `pnpm test` | Pasa (salida 0): `apps/web` 198 archivos y 2.510 tests; `apps/mobile` 26 de 26; `packages/shared` también |

Comprobación final de la base de pruebas tras el trabajo: 168 migraciones, 151 tablas (0 sin RLS), 229 filas en `audit_log`, 2 menús, 1 publicación, 2 versiones, 6 membresías, 0 descargas y **0 Edge Functions**: idéntico a la línea base de §3.1.

---

## Anexo · Cómo se generó el PNG de prueba
Carpeta temporal fuera del repo con `next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8`, `pdf-lib@1.17.1`, `tsx`; se copiaron tal cual `apps/web/src/core/menu-render.ts` y `apps/web/src/services/menu-image.tsx`; se llamó a `buildMenuDocument({…})` y `renderMenuPng(doc)` con los datos de §3.3 (plantilla `classic`, fondo `#FFFFFF`, texto `#1F2937`, acento `#145C4E`, cabecera "Bar Demo", pie "IVA incluido · Pan y bebida incluidos"). Dos renders seguidos: mismos bytes. Fichero: `docs/menu-prueba-bar-demo.png`, sha256 `b2340ca7c0085957c36c4a8927b7322773a2f6f72ec2cdee3e838dfa42d19bf0`.
