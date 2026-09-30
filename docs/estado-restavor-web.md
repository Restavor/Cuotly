# Restavor web: estado técnico del proyecto

**A fecha de 28/09/2026**, rama `claude/cuotly-supabase-migrations-tests-q8o18p`, última migración la 155.

El proyecto se llamaba **Cuotly** ("Cuotly · by Restavor") y desde el 27/09/2026 se llama **Restavor
web** (decisión 87 de `docs/DECISIONES.md`). El cambio es solo de lo que se ve: los identificadores del
código y de la base conservan `cuotly` (`@cuotly/web`, `cuotly_payments`, `cuotly-green`, el repositorio
`Restavor/Cuotly`, los proyectos de Vercel `cuotly-web` y `cuotly-movil`). Cuando este documento cita
un nombre del código, lo cita tal cual, aunque diga Cuotly.

Este documento está escrito para diseñar una ampliación **sin abrir el código**. Cómo se hizo: el
esquema de la base (apartado 2 y anexo A) no está copiado de la documentación. Sale de crear una base
PostgreSQL 16 vacía, aplicar `supabase/tests/bootstrap-postgres-local.sql` y las 155 migraciones en
orden, y leer el catálogo resultante. Las rutas salen de los `page.tsx` que existen. Las reglas de
negocio salen del PRD (`docs/PRD.md`) y de las decisiones (`docs/DECISIONES.md`), y se citan por su
código (`RN-xxx`) para que se puedan buscar.

**Jerarquía de autoridad del repositorio:** `CLAUDE.md` > `docs/PRD.md` > `docs/ESPECIFICACION-MAESTRA.md`.
Si algo de aquí contradice a esos tres, mandan ellos.

---

## Resumen en diez líneas

1. **Qué es:** una plataforma SaaS **multiempresa** para gestionar el mantenimiento web de restaurantes.
   Restavor es el primer "espacio de mantenimiento"; otros proveedores pueden tener el suyo.
2. **Tecnología:** Next.js 16 con React 19 y TypeScript estricto, más una app Expo 57 (React Native),
   sobre Supabase (PostgreSQL con RLS, Auth y Storage). Se despliega en Vercel (Dublín) y Supabase (Irlanda).
3. **Base de datos:** 119 tablas, **todas con RLS activado**, 149 políticas, 646 funciones (565 `SECURITY
   DEFINER`) y 155 migraciones. Casi toda escritura pasa por funciones RPC que validan en el servidor.
4. **Tres mundos:** el **equipo de mantenimiento** (propietario, administrador, trabajador), el
   **cliente** (el restaurante: propietario global, propietario local, editor) y la **plataforma**
   (Bosco y los administradores de Restavor web, con 2FA obligatoria).
5. **Entrada:** correo y contraseña. **No hay registro abierto**: se entra por una solicitud de acceso
   que aprueba Restavor web o por una invitación. No hay Google ni Apple.
6. **Modelo comercial de Restavor:** planes Básico (20 €), Impulso (99 €) y Premium (199 €), más IVA.
   Los cambios se miden en **créditos** y Menú Diario va incluido en Impulso y Premium.
7. **Dinero:** **sin Stripe**. Los pagos se registran a mano (transferencia o Bizum) en **libros
   inmutables** de apuntes con signo. Restavor web **no emite facturas** (bloque legal pendiente).
8. **Hecho:** fases 1 a 4 del ROADMAP, más el diseño definitivo de escritorio y el móvil aplicado a la
   web. Unas 120 pantallas web.
9. **Pendiente:** el bloque legal y fiscal, los aplazados de `CLAUDE.md` (API pública, abonos,
   calendarios bidireccionales, Agente), la app en las tiendas y el dominio propio (`app.restavor.com`,
   a medias).
10. **Restavor agents** no existe todavía: solo está el nombre (decisión 87). El apartado 12 dice qué habría
    que tocar para añadirlo junto a una puerta común, **Restavor app**.

---

## 1. Tecnología, versiones, carpetas y despliegue

### 1.1 Tecnología y versiones

| Pieza | Versión | Dónde |
|---|---|---|
| Gestor de paquetes | pnpm 9.15.0 (monorepo con `pnpm-workspace.yaml`: `apps/*`, `packages/*`) | raíz |
| Node | ≥ 20 | `package.json` raíz |
| Web | **Next.js 16.3.3** (App Router, Server Components, Server Actions), **React 19.2.8** | `apps/web` |
| Lenguaje | TypeScript 5, `strict: true` | todo |
| Estilos | **Tailwind CSS 4.3** (`@theme` en CSS, sin `tailwind.config`) + PostCSS | `apps/web/src/styles/tokens.css` |
| Base de datos y auth | **Supabase**: PostgreSQL (se prueba en local con PG 16), Auth, Storage. Clientes `@supabase/supabase-js` 2.112 y `@supabase/ssr` 0.12 | `supabase/`, `apps/web/src/lib/supabase/` |
| IA | `@anthropic-ai/sdk` 0.122: clasificación con `claude-haiku-4-5` y valoración en créditos con `claude-opus-5` | `apps/web/src/services/ai-*.ts` |
| PDF | `pdf-lib` 1.17.1 (informes y menús) | `apps/web/src/services/report-pdf.ts`, `menu-image.tsx` |
| Correo | **Resend** (API HTTP, sin SDK) | `apps/web/src/services/queue-gateway.ts` |
| Push | **Expo Push** | `queue-gateway.ts`, `apps/mobile` |
| Tests | Vitest 4 + Testing Library (unitarios), Playwright 1.62 (e2e), suites SQL propias (89 archivos en `supabase/tests/`), Jest + jest-expo (móvil) | |
| Móvil | **Expo ~57.0.18**, `expo-router` 57, **React Native 0.86.3**, React 19.2.3 | `apps/mobile` |

### 1.2 Carpetas principales

```
Cuotly/                                  (repositorio Restavor/Cuotly)
├── CLAUDE.md                            reglas obligatorias del repositorio
├── apps/
│   ├── web/                             @cuotly/web: la aplicación Next.js
│   │   ├── src/app/                     rutas (App Router), una carpeta por pantalla
│   │   ├── src/components/              componentes; ui/ son los componentes base de Emerald Control
│   │   ├── src/core/                    dominio puro (reloj laboral, créditos, estados, permisos), con tests
│   │   ├── src/services/                adaptadores externos: Supabase, Resend, Expo, Anthropic, Google…
│   │   ├── src/i18n/es.ts               TODO el texto visible (~10.000 líneas); nada de literales en JSX
│   │   ├── src/styles/tokens.css        los tokens de Emerald Control
│   │   ├── src/lib/supabase/            clientes de Supabase (servidor, navegador, admin)
│   │   ├── src/proxy.ts                 el "middleware" de Next 16: sesión caducada y segundo paso (2FA)
│   │   ├── e2e/                         tests de Playwright
│   │   └── vercel.json                  región dub1 y los dos cron
│   └── mobile/                          @cuotly/mobile: app Expo (importa src/core, services, i18n de la web por el alias @/)
├── packages/shared/                     @cuotly/shared (pequeño, tipos compartidos)
├── supabase/
│   ├── migrations/                      155 migraciones (NUNCA se edita una ya aplicada)
│   ├── tests/                           89 suites SQL + bootstrap-postgres-local.sql (PostgreSQL sin Docker)
│   ├── seed/espacio-demo.sql            espacio "demo" con 7 identidades (contraseña Restavor-demo-2026)
│   └── operaciones/                     scripts de operación puntual contra producción
├── scripts/supabase-local/              arrancar.sh: PG16 + PostgREST + pasarela de auth + next dev (sin Supabase)
└── docs/                                PRD, ROADMAP, DECISIONES, ESPECIFICACION-MAESTRA, DESPLIEGUE-*, diseno/
```

Regla de arquitectura (`CLAUDE.md`): **la lógica de dominio vive en `src/core/`**, sin dependencias de
Supabase, Next ni React y con tests unitarios; **los adaptadores externos viven en `src/services/`**; los
errores de negocio son tipos de resultado explícitos, no excepciones. La app móvil reutiliza `core`,
`services` e `i18n` de la web, así que una regla cambia en un sitio y vale en los dos.

### 1.3 Cómo se despliega

| Qué | Dónde | Detalle |
|---|---|---|
| Web | **Vercel**, proyecto `cuotly-web` (raíz `apps/web`), región **`dub1`** (Dublín) | Cada subida a la rama de trabajo despliega a **producción** en `cuotly-web.vercel.app`. Plan Hobby. |
| "Móvil en navegador" | Vercel, proyecto `cuotly-movil` (raíz `apps/mobile`) | Desde la decisión 77 **solo redirige** (307) cada dirección a la misma en `cuotly-web`; su rama de producción es `claude/cuotly-build-from-scratch-okynpm`. |
| Base de datos | **Supabase**, proyecto `Cuotly` (`mcajbfxhkxtdhjoyrqha`), **eu-west-1** (Irlanda) | Las migraciones se aplican al proyecto real a mano (el registro está en `docs/DESPLIEGUE-SUPABASE.md`). |
| Tareas programadas | Cron de Vercel → `GET /api/cola` a las 07:00 y 19:00 UTC | Protegido con `CRON_SECRET` o `QUEUE_RUNNER_SECRET`; sin secreto responde 503. |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | typecheck, lint, tests, build, Playwright, `expo export`, y `supabase start` + las suites SQL una a una. |
| Dominio propio | `app.restavor.com` en `cuotly-web` (CNAME en GoDaddy hecho el 29/09/2026) | `NEXT_PUBLIC_SITE_URL` ya apunta a él; quedan la *Site URL* de Supabase Auth y la redirect URI de Google OAuth (`docs/DESPLIEGUE-VERCEL.md`, última sección). |

Variables de entorno (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `CUOTLY_OWNER_EMAIL` (=`info@restavor.com`),
`CRON_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `INTEGRATIONS_VAULT_KEY` (+
`_VERSION`, `_PREVIOUS`), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, y en móvil
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_WEB_URL`.

**Aviso de estado (actualizado el 30/09/2026):** `RESEND_FROM` es ahora `Restavor web <avisos@restavor.com>`
(29/09/2026), pero **todavía no ha salido ningún correo real**: falta comprobar que el dominio esté verificado en Resend y
hacer el primer envío. Los avisos se encolan y no se pierden (`docs/DESPLIEGUE-VERCEL.md`).

---

## 2. Base de datos

### 2.1 Principios que manda `CLAUDE.md`

- **Multiempresa por `space_id`.** Toda tabla que pertenece a un espacio lleva `space_id NOT NULL`. Las
  18 tablas sin `space_id` son de la persona o de la plataforma: `profiles`, `spaces`,
  `group_memberships`, `establishment_memberships`, `establishment_permissions`,
  `establishment_transfers`, `access_requests`, `access_request_events`, `account_setup_tokens`,
  `space_request_events`, `platform_roles`, `platform_emails`, `platform_holidays`,
  `platform_status_events`, `platform_account_closures`, `help_articles`, `push_devices` y
  `profile_notification_preferences`.
- **Ninguna tabla sin RLS.** Las 119 lo tienen activado.
- **Libros inmutables.** Consumos y dinero se apuntan con signo y nunca se actualizan: `consumption_entries`,
  `financial_entries`, `menu_update_entries` y `cuotly_ledger_entries`. Los estados de un cobro y el
  saldo de créditos **se derivan** de los apuntes (`charge_status()`, `establishment_credit_balance()`).
- **Nada se borra físicamente.** No hay **ninguna** política `DELETE`. Se archiva (`archived_at`) o se
  marca (`permanently_deleted_at`, `revoked_at`).
- **Auditoría** en `audit_log` (actor, acción, entidad, `old_value`, `new_value`, motivo, sesión de
  soporte). No se edita ni se borra.
- **Estados como eventos:** `state_events`, `menu_events`, `incident_events`, `access_request_events` y
  `space_request_events` guardan cada transición con actor y motivo.
- **Idempotencia:** las operaciones críticas llevan `idempotency_key` con índice único (solicitudes,
  pagos, invitaciones, grupos, restaurantes, informes…).
- **Fechas** en `timestamptz`, calculadas en la zona del espacio (`spaces.timezone`, por defecto `Europe/Madrid`).
- **Dinero en céntimos enteros** (`*_cents`) y créditos en **medios créditos enteros** (`*_credits_half`: 1 = 0,5 créditos).

### 2.2 Tipos enumerados

Solo hay **dos `enum` de PostgreSQL**:

| Tipo | Valores |
|---|---|
| `space_role` | `owner`, `admin`, `worker` |
| `member_status` | `invited`, `active`, `temporarily_absent`, `inactive`, `access_revoked` |

El resto de estados son columnas `text` con restricción `CHECK (… = ANY (ARRAY[…]))`. Son los enumerados
de hecho del proyecto; estos son los que importan para diseñar (la lista completa sale del catálogo):

| Columna | Valores |
|---|---|
| `spaces.cuotly_plan` / `cuotly_subscriptions.plan` | `pro`, `agency` |
| `spaces.cuotly_status` | `trial`, `active`, `archived_trial_ended`, `archived_nonpayment`, `archived_by_owner`, `archived_by_platform` (nulo en Restavor: no se cobra a sí misma) |
| `establishments.status` | `configuring`, `active`, `paused`, `ending`, `read_only`, `suspended`, `archived` |
| `establishments.web_platform` | `landing_site`, `other` |
| `group_memberships.role` | `global_owner`, `editor` |
| `establishment_memberships.role` / `establishment_invitations.role` | `local_owner`, `editor` |
| `establishment_invitations.status` | `pending_review`, `approved`, `accepted`, `rejected`, `cancelled`, `expired` |
| `space_invitations.status` | `pending`, `accepted`, `cancelled`, `expired` |
| `access_requests.status` | `submitted`, `needs_information`, `approved`, `rejected` |
| `access_requests.tax_id_verification` | `checksum`, `registry`, `registry_not_found`, `registry_unavailable`, `unverified` |
| `space_requests.status` | `draft`, `submitted`, `in_review`, `needs_information`, `approved`, `rejected` |
| `subscriptions.kind` / `status` | `plan`, `service` / `active`, `cancelled` |
| `services.kind` | `daily_menu`, `other` |
| `plans.report_level` | `basic`, `standard`, `standard_plus`, `advanced`, `complete` |
| `plans.report_period` | `month`, `quarter`, `both` |
| `plan_commitments.cause` | `initial`, `plan_change` |
| `scheduled_plan_changes.direction` / `state` | `upgrade`, `downgrade` / `pending`, `applied`, `cancelled` |
| `requests.kind` | `change`, `incident` |
| `requests.state` | `draft`, `received`, `analyzing`, `needs_information`, `pending_internal_validation`, `pending_client_acceptance`, `accepted`, `in_progress`, `published`, `correction_requested`, `in_correction`, `closed`, `cancelled_before_start`, `cancelled_after_start`, `rejected` |
| `requests.priority` | `high`, `medium`, `low` |
| `requests.incident_outcome` | `restavor_error`, `external`, `quote`, `change` |
| `classifications.source` | `ai`, `rules`, `team` |
| `*.category` (consumo; heredado) | `small`, `photo`, `medium`, `large`, `credits` (hoy se usa `credits`) |
| `jobs.state` | `pending_assignment`, `assigned`, `reassignment_requested`, `in_progress`, `blocked_by_client`, `authorized_pause`, `published`, `in_correction`, `completed`, `cancelled_before_start`, `cancelled_after_start` |
| `jobs.required_specialty` / `worker_specialties.specialty` | `web`, `design`, `copy`, `seo`, `daily_menu`, `analytics`, `general` |
| `tasks.state` / `weight` | `pending`, `in_progress`, `blocked`, `completed`, `cancelled` / `light`, `normal`, `high`, `very_high` |
| `blocks.reason_type` | `client_information`, `external_incident`, `authorized_pause`, `financial_hold` |
| `consumption_entries.entry_type` | `debit`, `return`, `compensatory_credit` |
| `financial_entries.entry_type` | `charge`, `payment`, `waiver`, `refund`, `payment_reversal` |
| `payments.method` / `cuotly_payments.method` | `transfer`, `bizum` |
| `quotes.state` / `outcome` | `draft`, `sent`, `accepted`, `rejected` / `job`, `menu_template` |
| `menus.kind` | `daily`, `christmas`, `kids`, `groups`, `special_event` |
| `menus.state` | `draft`, `prepared`, `publication_requested`, `pending_assignment`, `assigned`, `needs_information`, `reviewing`, `ready_to_publish`, `published`, `cancelled`, `publication_error` |
| `menu_templates.purpose` / `layout` | `publish`, `print` / `classic`, `board`, `elegant` |
| `conversations.type` | `request`, `job_internal`, `establishment`, `channel` |
| `messages.sender_role` | `staff`, `client` |
| `files.category` | `logos`, `photos`, `menus`, `documents`, `reports`, `billing`, `requests_and_jobs`, `other` |
| `files.visibility` | `internal`, `shared_with_client` |
| `integrations.provider` | `ga4`, `search_console`, `business_profile`, `clarity`, `pagespeed` |
| `integrations.status` | `not_connected`, `pending_authorization`, `connected`, `syncing`, `needs_attention`, `error`, `disconnected` |
| `opportunities.status` | `detected`, `recommended`, `under_review`, `approved_for_report`, `discarded`, `in_progress`, `implemented`, `no_longer_applicable` |
| `reports.category` / `status` | `operation`, `finance`, `digital` / `preparing`, `pending_review`, `approved`, `scheduled`, `sent`, `archived` |
| `incidents.kind` / `status` | `error`, `suggestion` / `open`, `in_review`, `needs_information`, `in_progress`, `resolved`, `closed` |
| `support_sessions.access_level` | `read`, `admin`, `owner` |
| `notifications.audience` | `staff`, `client` |
| `notification_deliveries.channel` / `status` | `email`, `push` / `pending`, `sent`, `failed`, `dead` |
| `notification_schedules.frequency` | `instant`, `daily_digest` |
| `scheduled_jobs.kind` | `monthly_charges`, `dunning_sweep`, `sla_sweep`, `lifecycle_sweep`, `consumption_sweep`, `daily_menu_sweep`, `cuotly_billing_sweep`, `cuotly_storage_sweep`, `backup_sweep`, `charge_reminders`, `notification_digests` |
| `timer_events.counter_kind` / `event_type` | `t1`, `t2`, `t3` / `started`, `paused`, `resumed`, `stopped` |
| `space_working_hours.calendar_kind` | `contractual`, `support`, `menu_diario` |

`notifications.event_type` admite 64 tipos de aviso (de `request_submitted` a `credit_quote_requested`).

### 2.3 Las 119 tablas, por dominio

Columnas principales entre paréntesis. **El anexo A tiene todas las columnas de todas las tablas con su tipo.**

**Identidad y plataforma**
- `profiles` (id = `auth.users.id`, `email`, `full_name`, `given_name`, `family_name`, `phone`, `display_timezone`, `avatar_path`): la persona.
- `platform_roles` (`user_id`, `role`, `can_approve_spaces`, `can_manage_subscriptions`, `can_support`, `can_delete_accounts`): los administradores de Restavor web y sus cuatro permisos finos.
- `access_requests` + `access_request_events` + `account_setup_tokens`: la solicitud de acceso (6 campos más NIF y país) y el enlace de alta de un solo uso.
- `space_requests` + `space_request_events`: la solicitud de crear un espacio de mantenimiento (plan `pro`/`agency`).
- `support_sessions` (`space_id`, `actor_id`, `reason`, `access_level`, `expires_at`): Modo soporte.
- `platform_status_events`, `platform_holidays`, `platform_emails`, `platform_account_closures`, `help_articles`: página de estado, festivos de plataforma, correos de la plataforma, cuentas eliminadas y centro de ayuda.
- `push_devices`, `profile_notification_preferences`: dispositivos para push y preferencias de la persona fuera de un espacio.

**Espacio de mantenimiento y su equipo**
- `spaces` (`name`, `slug`, `timezone`, `tax_rate_percent`, `payment_term_days`, `legal_name`, `tax_id`, `address`, `logo_storage_path`, `cuotly_plan`, `cuotly_status`, `cuotly_trial_ends_at`, `onboarding_completed_at`, `permanently_deleted_at`).
- `space_memberships` (`space_id`, `user_id`, `role` space_role, `status` member_status, `can_perform_jobs`, `can_approve_reports`).
- `space_invitations` (`email`, `role`, `token`, `status`, `expires_at`).
- `supervisions` (Administrador principal o sustituto ↔ Trabajador), `worker_specialties`, `worker_establishments` (restaurantes autorizados a un trabajador), `worker_availability`, `absences`, `assignment_weights`.
- `space_working_hours` (tres relojes: contractual, soporte y Menú Diario), `holidays`, `space_sequences` (códigos correlativos `EST-0001`, `SOL-…`).
- `space_onboarding_confirmations`, `space_lifecycle_operations`, `space_exports`.
- `cuotly_subscriptions`, `cuotly_charges`, `cuotly_payments`, `cuotly_ledger_entries`: lo que el espacio paga a Restavor web (apartado 5.4).

**Clientes: grupos y restaurantes**
- `groups` (`space_id`, `name`, `description`): la empresa cliente.
- `establishments` (`space_id`, `group_id`, `code`, `name`, `status`, `legal_name`, `tax_id`, `address`, `postal_code`, `city`, `contact_name`, `contact_email`, `phone_primary`, `website_url`, `domain`, `opening_hours`, `web_platform`, `instagram`, `facebook_url`, `photo_file_id`).
- `group_memberships` (`global_owner` o `editor` del grupo), `establishment_memberships` (`local_owner` o `editor` del restaurante), `establishment_permissions` (los 7 permisos del cliente, apartado 3.3).
- `establishment_invitations` (el restaurante invita y el equipo aprueba), `establishment_managers` (responsable del restaurante en el equipo), `establishment_notes`, `internal_notes`, `establishment_transfers` (mover un restaurante a otro espacio), `establishment_backups` + `establishment_backup_downloads`.

**Catálogo y contrato**
- `plans` (`name`, `price_cents`, `included_credits_half`, `includes_daily_menu`, `start_sla_hours`, `queue_rank`, `report_level`, `report_period`, `grants_priority`, `watches_reviews`, `execution_sla_*`, versión: `lineage_id`, `revision`, `supersedes_id`, `archived_at`). Conserva las cuatro columnas `included_small/photo/medium/large` del modelo anterior.
- `services` (`name`, `kind`, `price_cents`, versionado igual que `plans`).
- `plan_versions`, `service_versions` (texto de las condiciones), `terms_acceptances`, `revision_acceptances`.
- `subscriptions` (`establishment_id`, `kind` plan/service, `plan_id` o `service_id`, `status`, `started_at`).
- `plan_commitments` (permanencia: `started_at`, `ends_at`, `cause`), `scheduled_plan_changes`.
- `consumption_cycles` (ciclo mensual con `included_credits_half`) y `consumption_entries` (libro de consumos).

**Solicitudes, trabajos y tareas**
- `requests` (`code`, `kind`, `state`, `description`, `context`, `priority`, `validated_credits_half`, `credit_breakdown`, `accepted_at`, `created_by_team`, `opportunity_id`…), `request_versions`, `request_attachments`.
- `classifications` (propuesta de la IA, de reglas o del equipo), `ai_usage` (tokens y coste en milicéntimos), `acceptances`.
- `jobs` (`code`, `state`, `assigned_to`, `started_at`, `published_at`, `credits_half`, `execution_sla_hours`, `quote_id`), `assignments`, `blocks`, `corrections`.
- `tasks`, `task_reassignment_requests`.
- `timer_events` (los tres contadores T1, T2 y T3), `state_events`.
- `quotes` (presupuestos aparte).

**Menú Diario**
- `menus`, `menu_versions` (entrantes, principales, postres, bebida, precio, alérgenos), `menu_templates` (publicar/imprimir), `menu_publications`, `menu_events`, `menu_corrections`, `menu_downloads`, `menu_update_cycles` + `menu_update_entries` (el contador antiguo, hoy sin uso según RN-CRE-22).

**Mensajes y archivos**
- `conversations`, `messages`, `message_edits` (10 minutos para editar; no se borran), `conversation_reads`, `channel_members`.
- `files`, `file_versions`, `file_links`, en el bucket privado `files`. Las fotos de perfil van en el bucket `avatars`.

**Dinero del restaurante**
- `charges` (`concept`, `period_start`, `period_end`, `base_cents`, `tax_rate_percent`, `tax_cents`, `total_cents`, `due_at`, `quote_id`), `financial_entries` (libro), `payments` (`amount_cents`, `method`, `paid_at`, `recorded_role`, `reversed_at`), `payment_confirmations`, `receipts`.

**Datos, oportunidades e informes**
- `integrations`, `integration_credentials` (cifradas con `INTEGRATIONS_VAULT_KEY`), `sync_runs`, `metric_points`, `reviews`.
- `opportunities`, `opportunity_detections`, `opportunity_notes`.
- `reports`, `report_sections`, `report_versions`, `report_deliveries`, `report_entry_texts`.

**Avisos, cola y soporte**
- `notifications`, `notification_deliveries`, `notification_preferences`, `notification_schedules`, `notification_digests`, `notification_digest_items`.
- `scheduled_jobs` (la cola de tareas programadas).
- `incidents`, `incident_messages`, `incident_events`, `incident_attachments` (lo que un espacio abre a Restavor web).
- `audit_log`.

Dos **vistas**: `client_jobs` y `client_establishment_status_events` (lo que el cliente puede leer de
trabajos y estados sin ver la organización interna).

### 2.4 Cómo funciona la seguridad por filas (RLS)

**Lectura por políticas y escritura por funciones.** Hay 149 políticas: 116 de `SELECT`, 20 de `INSERT`, 13
de `UPDATE` y **ninguna de `DELETE`**. Casi todo lo que cambia datos se hace con funciones RPC
`SECURITY DEFINER` que comprueban el permiso por su cuenta, abren la transacción, escriben el
apunte, el evento y la auditoría, y respetan la clave de idempotencia.

**Las funciones que usan las políticas** (hay 44). Las piezas centrales:

- `is_space_member(space_id)`: miembro activo del espacio, **o** una sesión de Modo soporte activa en él.
- `has_capability(space_id, capability)` → `has_capability_as(space_id, user_id, capability)`: el catálogo de
  capacidades del equipo, en un solo sitio:

  | Capacidad | Quién la tiene |
  |---|---|
  | `manage_space` | propietario |
  | `invite_member` | propietario, y nunca en Modo soporte |
  | `create_establishment`, `manage_clients`, `manage_holidays`, `manage_requests`, `assign_jobs`, `manage_finance`, `manage_absences` | propietario y administrador |
  | `perform_jobs` | trabajador, propietario, y administrador con `can_perform_jobs` |
  | `approve_reports` | propietario, y administrador con `can_approve_reports` |
  | `manage_files` | propietario, administrador y trabajador |
  | `view_team` | todos los miembros |
  | `contact_cuotly` (abrir incidencias a Restavor web) | propietario y administrador, nunca en Modo soporte |

- **Lado cliente:** `is_establishment_member`, `is_group_member`, `can_read_establishment_as_client`,
  `client_permission(establishment, permiso)`, `client_can_view_billing` y `client_can_view_reports`.
- **Lado trabajador:** `is_authorized_worker_establishment` (solo sus restaurantes autorizados),
  `can_read_job`, `can_read_task`, `is_report_worker` e `is_report_worker_for`.
- **Plataforma:** `is_platform_owner()` (exige el reclamo `aal2` del token, es decir, 2FA verificada),
  `is_platform_member`, `is_platform_approver`, `is_platform_subscription_manager`, `is_platform_supporter`
  e `is_platform_account_manager`.
- Un espacio eliminado (`space_is_gone`) no lo ve nadie, ni siquiera Modo soporte.

**Tapar identidades con privilegios de columna.** RLS filtra filas, no columnas. Para que el cliente no
vea **nunca** quién del equipo hizo algo (principio P7: "Equipo de mantenimiento"), en 18 tablas se hace
`revoke select … from anon, authenticated` y se vuelve a conceder `select` solo de las columnas sin
identidad. Las tablas son `messages`, `message_edits`, `files`, `file_versions`, `file_links`, `charges`,
`payments`, `payment_confirmations`, `receipts`, `financial_entries`, `requests`, `subscriptions`,
`corrections`, `plan_commitments`, `scheduled_plan_changes`, `space_requests`, `cuotly_payments` y
`cuotly_ledger_entries`. **Consecuencia práctica: en esas tablas `select *` devuelve 403**, y toda consulta
tiene que enumerar columnas. Cuando la fila entera es organización interna (`assignments`, `tasks`, los
`state_events` de tarea), al cliente se le deja fuera **de la fila** con RLS. Una suite
(`hito7_mensajes_archivos_finanzas.sql`) recorre todas las claves ajenas a `profiles` sentada como
cliente y falla si alguna le devuelve el uuid de alguien del equipo.

**Funciones internas cerradas.** Toda función `SECURITY DEFINER` que no comprueba permisos lleva
`revoke all … from public, anon, authenticated`. La excepción son las que aparecen dentro de una política,
que conservan `authenticated`.

**Modo soporte.** Un administrador de Restavor web entra en un espacio ajeno con motivo, nivel
(`read`, `admin` u `owner`) y caducidad. En `read` es solo lectura: **93 tablas** llevan el disparador
`<tabla>_guard_support_read_only`. Todo queda en la auditoría con `support_session_id`.

### 2.5 Migraciones

155 archivos en `supabase/migrations/`, del 30/08/2026 (`20260830000001_profiles.sql`) al 27/09/2026
(`20260927000155_la_app_se_llama_restavor_web.sql`). Nombre: `AAAAMMDD` + número correlativo de seis
cifras + descripción. Hasta la 42 están en inglés y desde la 43 en español. **Nunca se edita una ya
aplicada**: cada cambio es una migración nueva. El detalle de qué aplica cada una está en el ROADMAP y en
`docs/DESPLIEGUE-SUPABASE.md`. **La lista completa está en el anexo B.**

Agrupadas por fase:

- **1–42 · Fase 1** (operación real): perfiles, espacios, grupos y restaurantes, invitaciones, planes,
  capacidades, RLS, reloj laboral, solicitudes y clasificación, consumos, trabajos, mensajes, archivos y
  finanzas, avisos, cola y barridos.
- **43–76 · consolidación**: Storage, bandejas, borradores, prioridad, coordinación de tareas, notas,
  historial, condiciones versionadas.
- **77–80 · Fase 2**: Menú Diario, calendario completo y presupuestos.
- **81–88 · Fase 3**: integraciones, oportunidades, informes y fechas en la zona del espacio.
- **89–94 · Fase 4**: solicitud de espacio, suscripción de Restavor web, panel de Administración con
  Modo soporte y 2FA, onboarding, centro de ayuda y estado, app móvil y push.
- **95–155 · después del Hito 22**: pendientes de la Fase 4, cómo se entra, contexto global, piezas del
  diseño definitivo, invitaciones al panel, eliminación y archivado, catálogo de tres planes, **motor de
  créditos (149–154)** y el cambio de nombre (155).

---

## 3. Usuarios y acceso

### 3.1 Cómo se entra

- **Una sola forma de autenticarse: correo y contraseña** con Supabase Auth (RN-ACC-10: se retiraron
  Google y Apple, también en el servidor).
- **No hay registro abierto** (decisión 41, RN-ACC-01). Hay **dos puertas**:
  1. **Solicitud de acceso** en `/signup`, con seis campos: nombre y apellidos, restaurante o empresa,
     teléfono, correo, DNI/CIF/NIF con país, y comentario. El documento se comprueba en el servidor con
     el cálculo de control del país y **VIES** para IVA de la UE. La revisa Restavor web en
     `/administracion/accesos`, con el permiso "Aprobar espacios". **Aprobarla crea la cuenta y nada
     más.** Llega por correo un enlace de alta de un solo uso (`/alta/[token]`, tabla
     `account_setup_tokens`) donde se pone la contraseña. El solicitante sigue el estado en
     `/solicitud/[token]`.
  2. **Invitación** (`/invitaciones/[token]` para el equipo del espacio, `/panel/[token]` para el panel
     de un restaurante). El enlace crea la cuenta con el correo prefijado y bloqueado.
- Al entrar, **todo el mundo aterriza en `/`**, el **Inicio global** (decisión 42), desde donde elige
  contexto.
- `src/proxy.ts` (el middleware de Next 16) hace dos cosas: si la cookie de sesión ya no vale, manda a
  `/sesion-caducada`; si la cuenta tiene 2FA registrada y la sesión aún está en `aal1`, manda a
  `/cuenta/verificar`.

### 3.2 Tipos de usuario y roles

Una **cuenta** (`auth.users` + `profiles`) es una persona, y su papel depende del contexto. **La misma
cuenta puede ser a la vez equipo de un espacio, cliente de varios restaurantes y administrador de la
plataforma.**

| Mundo | Rol | Dónde se guarda | Qué puede |
|---|---|---|---|
| Plataforma | **Propietario de Restavor web** (Bosco) | `CUOTLY_OWNER_EMAIL` = `info@restavor.com` | Todo lo de plataforma, **solo con 2FA** (`aal2`) |
| Plataforma | **Administrador de Restavor web** | `platform_roles` + 4 permisos (`can_approve_spaces`, `can_manage_subscriptions`, `can_support`, `can_delete_accounts`) | Lo que se le conceda, con 2FA |
| Espacio | **Propietario** (`owner`) | `space_memberships.role` | Control total; único que invita al equipo, nombra administradores, toca planes y contrato |
| Espacio | **Administrador** (`admin`) | ídem, con `can_perform_jobs` y `can_approve_reports` | Operación, restaurantes, solicitudes, trabajos, finanzas, informes |
| Espacio | **Trabajador** (`worker`) | ídem, más `worker_establishments` y `worker_specialties` | Solo sus restaurantes autorizados, sus trabajos y tareas; puede marcar un cobro como pagado |
| Cliente | **Propietario global** | `group_memberships.role = global_owner` | Todos los restaurantes del grupo, actuales y futuros |
| Cliente | **Propietario local** | `establishment_memberships.role = local_owner` | Su restaurante |
| Cliente | **Editor** | `establishment_memberships.role = editor` (o de grupo) + `establishment_permissions` | Lo que digan sus permisos |

"**Supervisor**" no es un rol: es una relación Administrador–Trabajador en `supervisions`. "**Consulta**"
(solo lectura) es un Editor sin permisos concedidos.

### 3.3 Los siete permisos del cliente

En `establishment_permissions`, una fila por membresía de Editor. Los **siete permisos del diseño**
(migraciones 107 y 108, decisiones 51 y 52) son: `create_requests` (crear solicitudes), `edit_menus`
(Menú Diario), `use_messages` (mensajes), `upload_files` (archivos), `manage_users` (usuarios y
accesos), `view_billing` (pagos y facturas) y `view_reports` (consultar informes). La tabla tiene una
octava columna, `edit_establishment_data` (editar los datos del restaurante, RN-EST-11), que es
anterior y no forma parte de los siete del diseño. El propietario local o global lo tiene todo. El
antiguo rol "Consulta" se convirtió en un Editor con todas las casillas apagadas.

### 3.4 Varios establecimientos

**Sí, una cuenta puede tener varios restaurantes**, de uno o de varios grupos, e incluso **de varios
espacios de mantenimiento**. `my_contexts()` (migración 98) devuelve todos los contextos de la persona. En
el panel, el selector lista todos sus restaurantes y cambiar a uno de otro espacio cambia también el
espacio de la dirección (RN-PAN-04). Con un solo restaurante no hay selector (RN-PAN-05). Un restaurante
solo está activo en **un** espacio a la vez (RN-EST-07) y se puede transferir a otro
(`establishment_transfers`).

### 3.5 Invitaciones

- **Al equipo**: `space_invitations`. Solo invita el propietario (`invite_member`). Caduca a los 7 días y
  se acepta con `accept_space_invitation()`.
- **Al panel del restaurante** (decisión 59, "el restaurante invita, Restavor aprueba"):
  `establishment_invitations`. Invita el equipo con `manage_clients` o el cliente con `manage_users`.
  Si el correo ya tiene cuenta, el acceso se concede en el acto. Si hace falta crear cuenta, la
  invitación queda `pending_review` hasta que alguien del equipo la aprueba
  (`review_establishment_invitation()`). El cliente no ve quién la revisó.
- **Dar acceso directo** a una cuenta existente desde la ficha del restaurante (migración 70).

### 3.6 Segundo paso de seguridad (2FA)

- TOTP de Supabase Auth (`mfa.enroll`, `challenge`, `verify`). Se da de alta en `/cuenta/seguridad` y se
  pide en `/cuenta/verificar`.
- **Obligatoria para la plataforma** (RN-ADM-02): `is_platform_owner()` y todo lo de plataforma exigen
  `aal2`. Sin 2FA, Bosco entra como usuario normal en sus espacios y **ninguna** función de plataforma
  le responde.
- **Opcional** para el equipo y para los clientes. Quien la tiene registrada la pasa en **cada** inicio
  de sesión (lo fuerza `proxy.ts`).
- Sesiones visibles y cerrables en `/cuenta/sesiones`. En el móvil, biometría como **cerrojo local**
  (no es la 2FA, RN-MOV-08).

---

## 4. Clientes y establecimientos

### 4.1 Jerarquía

```
Plataforma (Restavor web)
└── Espacio de mantenimiento  (spaces; Restavor tiene slug 'restavor')
    ├── Equipo                 (space_memberships: owner / admin / worker)
    └── Grupo = empresa cliente  (groups)
        └── Establecimiento = restaurante  (establishments, código EST-0001…)
            ├── Personas del cliente  (group_memberships / establishment_memberships + establishment_permissions)
            ├── Suscripciones  (subscriptions: 0–1 plan + N servicios)
            ├── Solicitudes → Trabajos → Tareas
            ├── Menús, archivos, mensajes, cobros, integraciones, informes
            └── Notas internas (solo equipo) y responsable (establishment_managers)
```

- **La empresa** es un `group` con `name` y `description`. Los **datos fiscales** están en cada
  establecimiento (`legal_name`, `tax_id`, `address`…), no en el grupo.
- Crear un restaurante (`/espacios/<slug>/restaurantes/nuevo`) es de propietario y administradores.
  Nace en `configuring` y su "panel" existe cuando alguien del cliente tiene acceso vivo (RN-PAN-09: se
  deriva, no se guarda).
- Estados del restaurante: `configuring` → `active` ⇄ `paused` → `ending` → `read_only` → `suspended`, y
  `archived`. El motivo se deriva con `establishment_status_reason()`. Solo cambian por
  `set_establishment_status()` o los barridos: un `UPDATE` suelto lo rechaza un disparador.

### 4.2 Servicios contratados

Una fila de `subscriptions` por contrato: **`kind = 'plan'`** (mantenimiento, **como máximo uno activo**)
o **`kind = 'service'`** (servicios adicionales, pueden ser varios). Cada suscripción:

- apunta a una **versión** concreta del plan o servicio (`plans` y `services` se versionan con
  `lineage_id`/`revision`). Quien no acepta un cambio que le perjudica sigue en la versión que aceptó
  (decisión 72, RN-COM-19 a 30);
- tiene **condiciones** escritas por el espacio (`plan_versions`/`service_versions`) y aceptadas en la app
  o registradas por el equipo (`terms_acceptances`), con canal `in_app` o `external`;
- genera **ciclos mensuales** (`consumption_cycles`) con los créditos incluidos, y
- tiene **permanencia** en `plan_commitments`.

| Servicio | Cómo se guarda | Estado hoy |
|---|---|---|
| **Mantenimiento web** | `subscriptions.kind='plan'` → `plans` (Básico, Impulso, Premium) | Completo |
| **Menú Diario** | incluido si el plan tiene `includes_daily_menu`; suelto, `subscriptions.kind='service'` → `services.kind='daily_menu'` (199 € + IVA) | Completo. Un menú del día por fecha, dos plantillas (publicar e imprimir), sin hora de corte. Lo publica el equipo a mano. |
| Otros servicios | `services.kind='other'` | El modelo lo admite; hoy no hay ninguno |
| Presupuestos aparte | `quotes`: de un trabajo (`job`) o de una plantilla de menú (`menu_template`) | Completo |

---

## 5. Cobros

Hay **dos flujos de dinero distintos** y conviene no mezclarlos:

- **A. Lo que el restaurante paga a su espacio** (Restavor a sus clientes): `charges`, `payments` y
  `financial_entries`.
- **B. Lo que un espacio paga a Restavor web** por usar la plataforma: `cuotly_*`. Restavor no se paga
  a sí misma.

### 5.1 Planes y precios de Restavor (A)

| | **Básico** | **Impulso** | **Premium** |
|---|---|---|---|
| Precio al mes (+ IVA 21 %) | 20 € | 99 € | 199 € |
| Créditos al mes | 0 | 20 | 40 |
| Confirmación de inicio (T1/T2) | 48 h laborables | 24 h laborables | 24 h laborables |
| Turno en la cola (`queue_rank`) | 0 | 1 | 2 |
| Informe | trimestral | mensual y trimestral | mensual y trimestral |
| Menú Diario | no (suelto, 199 €) | incluido | incluido |

- **Créditos** (PRD §41, RN-CRE): unidad de 0,5; cada solicitud cuesta 0,5 de procesamiento más su
  trabajo. **La IA fija los créditos sola** (`claude-opus-5`, con la tabla de referencia en el prompt) y
  el restaurante acepta viendo **qué porcentaje de su plan** consume; no ve créditos. Si no le llega,
  elige entre quitar cosas, esperar al ciclo siguiente o pedir presupuesto. No se acumulan de un mes a
  otro. Los errores de Restavor, las incidencias y lo rechazado no gastan.
- **Impulso+ y Premium+ están archivados** (decisión 84, migración 148). Comprobado en el proyecto real el
  28/09/2026: el espacio `restavor` tiene Básico (0 créditos), Impulso (99 €, 40 medios créditos, Menú
  Diario) y Premium (199 €, 80 medios, Menú Diario), e Impulso+ y Premium+ archivados.
- **La vista antigua por categorías sigue en el código, solo como respaldo.** Si el ciclo del plan no
  tiene créditos (`included_credits_half = 0`), el Inicio y Plan y servicios del restaurante enseñan
  "Cuotas de este ciclo" por categoría en vez de la barra "Consumo del plan". En producción solo lo
  vería un restaurante en Básico (que no incluye nada y lo dice) o en un plan antiguo.
- Los precios de un espacio distinto de Restavor los fija ese espacio en su catálogo. **No hay precios
  negociados** por restaurante en los planes de Restavor (RN-COM-14).

### 5.2 Cómo se registra un pago (A)

1. **Emisión:** en la fecha de renovación, `generate_monthly_charge_internal()` (cola `monthly_charges`)
   crea el cobro (`charges`) con base, IVA congelado y total. Vence a los `payment_term_days` del espacio
   (7 por defecto). Se apunta un `charge` en `financial_entries`.
2. **Pago:** **sin Stripe ni pasarela.** El equipo registra el pago a mano con `register_payment()`:
   importe, fecha, método (`transfer` o `bizum`) y justificante opcional. Admite **pagos parciales**. Un
   trabajador puede marcarlo como pagado desde la ficha de un restaurante que tenga asignado. El
   restaurante puede **subir un justificante** (`upload_payment_receipt()`), pero **confirmar es siempre
   del equipo**.
3. **Otras operaciones**, todas con apunte: `waive_charge` (perdonar), `reverse_payment` (revertir) y
   `refund_charge` (reembolsar, que **reabre** la deuda). **Anular o abonar un cobro no existe**
   (aplazado).
4. **Recordatorios** de vencimiento (`run_charge_reminders`, `charge_due_today`).

**Estado del cobro:** **no se guarda, se deriva** con `charge_status()` a partir del libro:
`pending` · `paid` · `partially_paid` · `overdue` · `waived` · `refunded`.

### 5.3 Impago, suspensión, permanencia y baja (A)

- **Impago** (RN-FIN-10 a 14): a las **+24 h** del vencimiento el restaurante pasa a `paused` ("Pausado por
  impago") y **se detiene el servicio**: contadores, trabajos y publicaciones. A las **+72 h** pasa a
  `suspended`. No se borra nada. Al confirmarse el pago, `reactivate_establishment_after_payment()` lo
  reactiva y **los contadores siguen donde se pararon**. Lo mueve el barrido `dunning_sweep`
  (`set_establishment_nonpayment_status`).
- **Permanencia**: **3 meses** en todos los planes, en `plan_commitments`. La reinicia cualquier cambio
  voluntario de plan. Mejorar el plan es inmediato, con prorrateo en céntimos y créditos extra
  redondeados al alza (`change_plan_immediately`, `plan_change_proration`). **Bajar de plan solo en la
  renovación y tras cumplir la permanencia** (`schedule_plan_change`). No hay bolsas de horas.
- **Baja**: `ending` (ha comunicado la baja y sigue con servicio hasta el final del periodo pagado o de la
  permanencia) → `read_only` 24 h → `suspended`. Los datos no se eliminan automáticamente. La suspensión
  por impago **no cancela** la permanencia: para darse de baja hay que pagar lo que quede.

### 5.4 Lo que un espacio paga a Restavor web (B)

- **Pro**: 149 € + IVA al mes, 5 restaurantes activos y 5 usuarios internos, 20 GB. Cada restaurante
  adicional cuesta 25 € y cada usuario adicional 15 €.
- **Agency**: 499 € + IVA al mes, ilimitado con "uso razonable" (sin umbral, lo vigila Bosco), 100 GB.
- **Prueba** de 7 días con 2 restaurantes. La primera mensualidad se emite al aprobar el espacio.
  Si no se paga, el espacio queda **archivado en solo lectura** (`archived_trial_ended` o
  `archived_nonpayment`). Los límites se comprueban con disparadores en el servidor.
- El propietario del espacio **declara** el pago (`declare_cuotly_payment`) y Restavor web lo
  **confirma o rechaza** (`confirm_cuotly_payment`, `reject_cuotly_payment`) desde `/administracion/cobros`.
- Almacenamiento: avisos al 80 % y al 100 %; pasarse **se presupuesta aparte** (no hay precio por GB).

### 5.5 Facturas

**Restavor web no emite facturas.** La numeración fiscal está en el bloque legal pendiente. Lo que se
emite es un **cobro con referencia bancaria**. Se puede **adjuntar la factura oficial** emitida fuera
(`attach_invoice_to_charge`, `services/invoices.ts`) para que el cliente la descargue. La pantalla de
facturas deja el sitio hecho y dice que aún no se emiten. Bosco prevé un **agente de facturas** aparte
(decisiones 38 y 69).

### 5.6 Stripe

**No hay Stripe ni ninguna pasarela, y es una decisión, no un pendiente** (`CLAUDE.md`: "Sin Stripe: los
pagos se registran manualmente").

---

## 6. Panel de Restavor

"Panel de Restavor" son dos cosas distintas en el código:

### 6.1 El espacio de mantenimiento (el equipo de Restavor trabajando)

Ruta base **`/espacios/<slug>`** (Restavor: `/espacios/restavor`). Menú lateral verde oscuro, en el orden
de `desktopMenu()` (`src/components/shell/navigation.ts`):

| Destino | Ruta | Subrutas principales |
|---|---|---|
| Inicio | `/espacios/<slug>` | `puesta-en-marcha` (onboarding) |
| Restaurantes | `/restaurantes` | `nuevo`, `grupos`, `archivados`, `[id]` (ficha interna con cinco pestañas: Resumen, Operación, Informes y datos, Gestión, Historial) y bajo la ficha: `actividad`, `archivos`, `consumos`, `convertir`, `datos`, `facturacion` (+`[chargeId]`, `documentos`), `fuentes`, `mensajes`, `menu-diario` (+`nuevo`, `plantillas`, `servicio`, `[menuId]`), `plan` (+`cambio`), `prioridad`, `resenas`, `solicitudes` (+`nueva`, `[requestId]`, `[requestId]/borrador`), `usuarios`, `ajustes`, `ayuda` |
| Solicitudes | `/solicitudes` | `nueva` (en nombre del restaurante), `[id]` |
| Trabajos | `/trabajos` | `[id]`, `[id]/tareas` |
| Tareas | `/tareas` | |
| Menú Diario | `/menu-diario` | `[menuId]` |
| Mensajes | `/mensajes` | `[id]`, `canales` |
| Calendario | `/calendario` | `ausencia`, `festivo` |
| Finanzas | `/finanzas` | `cobros/[id]`, `presupuestos` (+`nuevo`, `[id]`) |
| Informes | `/informes` | `[id]` |
| Equipo | `/equipo` | `invitar` |
| Planes y servicios | `/planes` | `[id]`, `condiciones` |
| Ayuda | `/ayuda` | `guias/[articleSlug]`, `incidencias` (+`nueva`, `[id]`) |
| *(pie)* Agente Restavor web | `/agente` | **"Próximamente"**, sin funcionalidad |
| *(pie)* Ajustes | `/ajustes` | `auditoria`, `exportacion`, `propiedad`, `suscripcion` |

Además tiene cabecera con miga de pan, buscador global (⌘K), campana de avisos, botón **Crear** (sus
opciones dependen del rol: solicitud, restaurante, invitar, festivo, ausencia) y avatar. En móvil hay
una barra inferior única para todos: **Inicio · Restaurantes · Crear (+) · Mensajes · Más**
(`/espacios/<slug>/mas`).

### 6.2 El panel de Administración de la plataforma (Restavor web como empresa)

Ruta **`/administracion`**, con armazón propio (`app/administracion/layout.tsx`). Solo responde a
miembros de la plataforma **con 2FA**:

Resumen (`/administracion`) · Solicitudes de acceso (`/accesos`, `/accesos/[id]`) · Solicitudes de alta
de espacio (`/solicitudes`, `/solicitudes/[id]`) · Espacios (`/espacios`) · Restaurantes (`/restaurantes`)
· Archivados (`/archivados`) · Cobros e impagos (`/cobros`) · Usuarios (`/usuarios`,
`/usuarios/[id]/eliminar`) · Modo soporte (`/soporte`) · Incidencias (`/incidencias`, `/incidencias/[id]`)
· Estado y festivos (`/estado`) · Auditoría (`/auditoria`).

La página pública de estado está en **`/estado`**.

---

## 7. App del cliente (panel del restaurante)

**No es otra app ni otras rutas**: es la **misma dirección** que la ficha del equipo,
`/espacios/<slug>/restaurantes/<id>/…`, servida con **otro armazón** según la membresía real de quien
mira (RN-PAN-01 y RN-PAN-08). La cabecera dice "Panel de restaurante" y el nombre del local, **nunca el del
espacio** (RN-PAN-03). Lleva selector de restaurante y "Volver al inicio de Restavor web".

### 7.1 Menú (`fullNav()` para `client` y `client_daily_menu`)

| Destino | Ruta bajo `/espacios/<slug>/restaurantes/<id>` | Vistas del diseño |
|---|---|---|
| Inicio | *(raíz)* | R01, R02, R04, R43: "Hola, {nombre}", lo que espera algo de él, consumo del plan en %, próxima publicación, actividad, mensajes y trabajos en curso |
| Solicitudes | `/solicitudes`, `/solicitudes/[requestId]`, `/solicitudes/[requestId]/borrador` | R05, R07–R12: estado, créditos en % del plan, aceptar, corrección o cancelación |
| + Nueva solicitud | `/solicitudes/nueva` | R06 |
| Menú Diario *(solo si lo tiene)* | `/menu-diario`, `/menu-diario/nuevo`, `/menu-diario/[menuId]`, `/menu-diario/plantillas`, `/menu-diario/servicio` | R13–R19, A17, A18 (incluye alérgenos) |
| Mensajes | `/mensajes` | R20: la conversación general y las de cada solicitud |
| Calendario | `/calendario` | R21 |
| Plan y servicios | `/plan`, `/plan/cambio` | R23, R24: consumo, condiciones y cambio de plan |
| Pagos y facturas | `/facturacion`, `/facturacion/[chargeId]`, `/facturacion/documentos` | R25–R27 (solo con `view_billing`) |
| Informes y datos | `/datos` | R29–R35, A19, A20 (con `view_reports`) |
| Archivos | `/archivos` | R28 |
| Usuarios y accesos | `/usuarios` | R42 (invitar, con `manage_users`) |
| *(pie)* Ajustes y ayuda | `/ajustes`, `/ayuda`, `/ayuda/guias/[articleSlug]`, `/fuentes` (autorizar Google, Clarity y PageSpeed) | R36–R40, R44 |

Otras rutas del cliente: `/actividad` (R41, historial), `/resenas` y `/prioridad`.

### 7.2 El contexto global (fuera de todo espacio o panel)

Es lo que ve **cualquiera** al entrar (`app/(global)/`):

- `/`: Inicio global, con lo que necesita atención en todos sus contextos y tarjetas para entrar en cada uno.
- `/restaurantes`: pestañas `?lado=mantenimiento` y `?lado=restaurantes`.
- `/mensajes`: bandeja global.
- `/cuenta`, `/cuenta/seguridad`, `/cuenta/sesiones`, `/cuenta/verificar`, `/cuenta/cerrar`.
- `/ayuda` (+`guias/[articleSlug]`), `/mis-solicitudes` y `/solicitar-espacio`.
- `/mas`.

Rutas públicas o de acceso (`app/(auth)/`): `/login`, `/signup` (solicitud de acceso), `/alta/[token]`,
`/invitaciones/[token]`, `/panel/[token]`, `/solicitud/[token]` y `/sesion-caducada`. Hay además
`/styleguide` y `/armazon` (el catálogo visual y el armazón, para desarrollo).

---

## 8. Sistema visual "Emerald Control"

**Dónde está:** los tokens en **`apps/web/src/styles/tokens.css`** (bloque `@theme` de Tailwind 4, que
genera las utilidades `bg-primary`, `text-danger`, `border-border`…) y la especificación en **PRD §20.6** (y
§146 de la especificación maestra). **Regla: nunca un hexadecimal suelto en un componente.**

### 8.1 Colores

| Token (`--color-…`) | Valor | Uso |
|---|---|---|
| `primary-darkest` | `#051510` | el más oscuro |
| `primary-dark` | `#0B2F2A` | fondo del menú lateral y títulos |
| `primary` | `#145C4E` | botón principal y destino activo |
| `cuotly-green` | `#1D8A6A` | verde de marca ("Restavor web Green"), enlaces y contorno |
| `accent-green` | `#32B889` | acento |
| `background` | `#F5F7F4` | fondo de página |
| `surface` | `#FFFFFF` | tarjetas |
| `soft-surface` | `#EAF0EC` | superficies suaves e insignias neutras |
| `text` | `#17211F` | texto principal |
| `text-secondary` | `#66736E` | texto secundario |
| `border` | `#DDE5E1` | bordes |
| `sidebar-raised` / `sidebar-border` / `sidebar-text` | `#1B3C35` / `#24473F` / `#B5D2CD` | menú lateral, medidos para contraste AA |
| `success` / `warning` / `danger` / `info` | `#168A6D` / `#D89524` / `#C84C4C` / `#3976D4` | estados |
| `chart-1` / `chart-2` | `#1D8A6A` / `#5B6CB8` | series de gráficas (verde e índigo, medidas contra daltonismo) |

### 8.2 Tipografía, espaciado y radios

- **Tipografía: Inter**, cargada con `next/font/google` en `app/layout.tsx` (`--font-inter` → `--font-sans`).
- **Espaciados: no hay tokens propios**; se usa la escala por defecto de Tailwind (`p-4`, `gap-3`…) con una
  única densidad cómoda.
- **Radios:** `--radius-field: 10px` (campos y botones) y `--radius-card: 20px` (tarjetas).
- **Un único modo claro**: sin modo oscuro, sin selector de densidad, sin marca blanca. Un espacio puede
  cambiar su nombre y logotipo, pero la identidad **Restavor web** ("Restavor" grande y "web" pequeño) se
  conserva siempre.
- En móvil (< 640 px), toda `<Table>` se apila en tarjetas (reglas en `tokens.css`).

### 8.3 Componentes base (`apps/web/src/components/ui/`)

`Button` (variantes `primary`, `secondary`, `outline`, `danger`; estado `pending`), `ButtonLink`,
`Field`, `TextArea`, `Select`, `Card` (tono `danger` opcional), `StatusBadge` (tonos `success`,
`warning`, `danger`, `info`, `neutral`, con punto de color), `StatCard`, `ProgressBar`, `Table` (+
`TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`, `TableCell`, `TableFooter`; se apila en
móvil), `PageHeader`, `Tabs`, `FilterBar` (+ `FilterSearch`, `FilterSelect`), `Avatar` (+
`PersonCell`), `EntityCell`, `Modal`, `Toast` (`ToastProvider`, `useToast`), los estados obligatorios
`LoadingState`, `EmptyState`, `ErrorState`, `NoPermissionState` y `EmptyReason`, `PageLoading`, e `Icon`
(49 iconos con nombre).

El armazón está en `components/shell/`: `AppShell.tsx`, la navegación como **datos** en `navigation.ts`,
y `MobileContextCard.tsx`. El catálogo visual vivo está en `/styleguide`. Los diseños de referencia son
PDF en `docs/diseno/` (`Cuotly_definitivo_diseno.pdf`, `Cuotly_movil.pdf`, con 157 vistas).

---

## 9. Correos, notificaciones, tareas programadas e integraciones

### 9.1 Notificaciones

- Un **evento** crea una fila en `notifications` (destinatario, `event_type` de entre 64, entidad,
  `deep_link` y `dedupe_key` para no duplicar). Se lee en la campana de la app.
- Cada canal que toque (`email`, `push`) crea una fila en `notification_deliveries`, que la **cola**
  envía con reintentos (`attempts`, `next_attempt_at`) hasta `sent` o `dead`.
- Preferencias por evento y canal (`notification_preferences` en el espacio,
  `profile_notification_preferences` fuera de él) y frecuencia **al momento** o **resumen diario a las
  08:00** (`notification_schedules`, `notification_digests`).
- El cliente nunca ve identidades del equipo en los avisos (P7).

### 9.2 Correos

- **Resend** por API HTTP (`createResendTransport` en `services/queue-gateway.ts`). Remitente en
  `RESEND_FROM` (por defecto `Restavor web <avisos@cuotly.com>`).
- Dos colas: los avisos del espacio (`notification_deliveries`) y los **correos de plataforma**
  (`platform_emails`: solicitud de acceso recibida, falta información, aprobada, rechazada, ya
  registrado, cuenta eliminada).
- Plantillas en texto desde `es.ts` (`createMailComposer`, `createPlatformEmailComposer`).
- **Estado: todavía no ha salido ningún correo en producción** (apartado 1.3).

### 9.3 Push

**Expo Push** (`createExpoPushTransport`) a los dispositivos de `push_devices`, con la misma cola que el
correo. Solo con la app nativa.

### 9.4 Tareas programadas

- **Cron de Vercel** → `GET /api/cola` dos veces al día, a las **07:00 y 19:00 UTC** (`apps/web/vercel.json`). La
  ruta trabaja con `service_role` y hace, por orden:
  1. `runScheduledJobs`: reclama y ejecuta `scheduled_jobs` (`monthly_charges`, `dunning_sweep`,
     `sla_sweep`, `lifecycle_sweep`, `consumption_sweep`, `daily_menu_sweep`, `cuotly_billing_sweep`,
     `cuotly_storage_sweep`, `backup_sweep`, `charge_reminders`, `notification_digests`);
  2. `runSlaSweep` por espacio (los contadores T1, T2 y T3 sobre el reloj laboral, que empieza el lunes a
     las 09:00);
  3. `runIntegrationSyncs` y `runPendingRevocations`;
  4. `runOpportunityDetection` (reglas deterministas; umbrales de la decisión 26);
  5. `runReportQueue` (generación de informes);
  6. `drainDeliveryQueue` (correo y push) y `drainPlatformEmailQueue`.
- Otras rutas API: `/api/archivos/[id]`, `/api/copias/[id]`, `/api/exportacion`,
  `/api/incidencias/adjunto`, `/api/integraciones/oauth/callback`, `/api/movil/archivos`,
  `/api/movil/solicitud-acceso` y `/api/diagnostico`.

### 9.5 Integraciones externas

| Integración | Para qué | Dónde |
|---|---|---|
| Supabase | BD, Auth, Storage (buckets privados `files` y `avatars`) | `lib/supabase/`, `services/*-gateway.ts` |
| Anthropic | Clasificar solicitudes (`claude-haiku-4-5`) y valorarlas en créditos (`claude-opus-5`); coste en `ai_usage`. Si falla, van a las reglas (`core/classification-rules.ts`) o al equipo | `services/ai-classifier.ts`, `ai-credit-valuator.ts` |
| Google Analytics 4, Search Console, Business Profile (reseñas) | Métricas y reseñas del restaurante, por OAuth; credenciales cifradas | `services/integrations/ga4.ts`, `search-console.ts`, `business-profile.ts`, `google-oauth.ts` |
| Microsoft Clarity, PageSpeed | Métricas por clave de API | `services/integrations/clarity.ts`, `pagespeed.ts` |
| VIES (Comisión Europea) | Comprobar el NIF-IVA en la solicitud de acceso | `services/vies.ts` |
| Resend | Correo | `services/queue-gateway.ts` |
| Expo Push | Push | ídem |

**No existen** (aplazados o descartados): Stripe, API pública, webhooks salientes, sincronización
bidireccional de calendarios y botón "Sincronizar ahora". Tampoco se monitorizan reservas ni delivery.

---

## 10. App móvil (Expo)

- **Dónde:** `apps/mobile`, Expo ~57 + `expo-router` 57 + React Native 0.86. Nombre en `app.json`:
  "Restavor web", esquema de enlaces `cuotly://`.
- **Qué tiene:** **29 pantallas** (unas 4.700 líneas) que **reutilizan** `core`, `services`, `i18n` y la
  navegación de la web. Cubre los **once flujos** del Hito 22: solicitar; validar y aceptar; asignar;
  comenzar; bloquear; publicar con evidencia; corregir; pagar y confirmar; preparar menú; consultar
  informe; y equipo y ajustes. Además tiene **push** (Expo), cámara y galería, **cerrojo biométrico** y
  modo **sin conexión** con borradores. Lo que no tiene, lo dice y remite a la web (catch-all
  `[...resto].tsx`). No tiene panel de Administración ni Modo soporte, a propósito.
- **Punto en el que está: parada y desfasada.** El paso 2 rehízo la web (contexto global, panel del
  restaurante como contexto, créditos…) y la app no se tocó (`docs/diseno/ESTADO-DE-LA-APP-MOVIL.md`).
  - **Decisión 76:** el diseño móvil (`Cuotly_movil.pdf`) se aplicó a **la web en el teléfono**, no a
    Expo. Hoy la experiencia móvil real es la web responsive.
  - **Decisión 77:** `cuotly-movil.vercel.app` redirige a la web. **Para las tiendas** (paso 7), la app
    tendrá que llevar el mismo diseño: está **sin decidir** si será la web dentro de un armazón nativo
    (push, biometría, cámara) o pantallas nativas rehechas.
  - **No está publicada en App Store ni en Google Play**. Faltan las cuentas de desarrollador, el
    `projectId` de EAS y las compilaciones nativas.

---

## 11. Qué falta por hacer

### 11.1 `PROGRESS.md`

**No existe ningún `PROGRESS.md` en el repositorio** (ni en la raíz ni en ninguna carpeta). El estado se
lleva en `docs/ROADMAP.md` (hitos y "Después del Hito 22"), `docs/DECISIONES.md` (87 decisiones
numeradas) y `docs/DESPLIEGUE-*.md` (lo aplicado en Supabase y Vercel).

### 11.2 El orden acordado (decisión 37) y dónde está cada paso

| Paso | Qué | Estado |
|---|---|---|
| 1 | Las cuatro pendientes de la Fase 4 | **Hecho** (16/09) |
| 2 | Diseño definitivo de escritorio | **Hecho** |
| 3 | Diseño definitivo móvil | **Hecho** en la web (24/09, decisión 76) |
| — | Fuera de orden: informes desde la ficha, créditos (decisión 85), catálogo de tres planes y cambio de nombre | **Hecho** (25–27/09) |
| **4** | **Bloque legal y fiscal** (§170.1): términos de uso, privacidad, retenciones, numeración fiscal de facturas y jurisdicción, **con revisión profesional**. "No se lanza sin eso." | **Pendiente, el siguiente.** `CLAUDE.md` pide parar y confirmar con Bosco antes de empezarlo |
| 5 | Desplegar todo en Vercel | En parte: la web está desplegada; falta el dominio `app.restavor.com` (CNAME en GoDaddy) y arreglar el correo (`RESEND_FROM` y verificar el dominio en Resend) |
| 6 | Lo aplazado en `CLAUDE.md` | Pendiente: **API pública y webhooks**, **cancelación, anulación o abono de un cobro**, **sincronización bidireccional de calendarios** y **Agente Restavor web** (hoy solo "Próximamente") |
| 7 | La app en las tiendas | Pendiente, con la decisión de arquitectura abierta (apartado 10) |
| 8 | Desplegar todo otra vez | Pendiente |

### 11.3 Otros puntos sueltos que conviene saber

- **Sin inventar** (`CLAUDE.md`): la fórmula ponderada de recomendación de trabajador (se usa el orden
  determinista del PRD) y la categoría de puntos para tareas de más de 4 horas.
- **Menú Diario**: el agente de IA que publicará al guardar **no existe**; publica el equipo a mano.
- **Facturas**: el agente de facturas es de Bosco y externo; en la app solo queda el sitio.
- **Plan de Vercel**: la cuenta está en Hobby (uso no comercial); a un producto con clientes le
  corresponde Pro.
- **Diferencias con el diseño móvil a propósito**: cuerpo de letra, formularios a una columna, filtros
  a dos por fila y el papel de cada persona en la tarjeta de contexto del panel (`docs/diseno/PLAN-MOVIL.md`).
- **Restos del modelo anterior**: las columnas `included_small/photo/medium/large`, las categorías
  pequeño, fotográfico, mediano y grande, y `menu_update_*` siguen en la base porque las migraciones no
  se reescriben. Hoy el consumo es en créditos.
- **El sembrado de demostración está desfasado** (`supabase/seed/espacio-demo.sql`): sus planes son el
  catálogo antiguo (Impulso a 299 € con cambios pequeños, fotográficos y medianos; Impulso+ y Premium+
  activos; 0 créditos) y sus solicitudes y consumos van por categorías. La migración 154 solo pasó a
  créditos el espacio `restavor`. Hay que reescribirlo en créditos. No se ha tocado porque este trabajo
  era solo de documentación.

---

## 12. Añadir "Restavor agents" y una puerta común "Restavor app"

**Lo que hay hoy:** la decisión 87 dice que la app se llamará **Restavor** y tendrá **dos partes, Restavor
web y Restavor agents**; Restavor agents "no existe todavía". En el código no hay nada de Restavor agents.
El **Agente Restavor web** que aparece en el menú como "Próximamente" es otra cosa (§20.2: un asistente
dentro del espacio de mantenimiento) y conviene no confundirlos. **Antes de diseñar hay que preguntar a
Bosco** qué es exactamente Restavor agents: quiénes son sus usuarios (¿los mismos restaurantes?, ¿otros
clientes?), si se cobra aparte y si es multiempresa como Restavor web. Lo que sigue es qué partes se
tocan, no una decisión.

### 12.1 Lo que se puede reutilizar tal cual

- **La cuenta única ya existe.** `auth.users` + `profiles` es la persona, independiente de cualquier
  espacio, y una misma cuenta ya tiene varios papeles. **"Un único acceso" no requiere un sistema de
  identidad nuevo**: basta con que Restavor agents cuelgue de la misma cuenta.
- La **puerta de entrada** (solicitud de acceso, invitaciones, 2FA, sesiones, `/cuenta`), el proxy de
  sesión, el sistema de avisos y la cola, el bucket de archivos, la auditoría, el panel de Administración
  y el sistema visual.
- **El patrón del "Inicio global" ya es casi una puerta común.** `/` es hoy un sitio fuera de todo contexto
  que enseña tarjetas para entrar en cada espacio y cada panel (`app/(global)/page.tsx`,
  `ContextCards.tsx`, `my_contexts()`). Restavor app puede ser ese mismo Inicio con un nivel más arriba.

### 12.2 Lo que habría que tocar

**Rutas y armazón (web)**
1. **La raíz `/`.** Hoy es el Inicio global de Restavor web (decisión 42). Con Restavor app pasaría a ser
   la **pantalla de elegir** (Restavor web o Restavor agents), y el Inicio global actual se movería, por
   ejemplo a `/web`. Eso toca `app/(global)/page.tsx`, `navigation.ts` (`GLOBAL_HOME`, `globalMenu()`,
   `globalMobileNav()`, "Volver al inicio de Restavor web"), `proxy.ts` y las redirecciones a `/` tras
   entrar (`app/(auth)/actions.ts`, 4 sitios). **Alternativa menos invasiva:** dejar `/` como está y
   añadir un conmutador de producto en la cabecera. En cualquier caso, **cambiar la raíz es cambiar la
   decisión 42** y lo tiene que decidir Bosco.
2. **Un grupo de rutas nuevo para Restavor agents**, por ejemplo `app/agents/…` o `app/(agents)/…`, con su
   armazón. Hay dos precedentes de armazón propio: el panel del restaurante (mismo `AppShell`, otra
   navegación) y `/administracion` (armazón aparte).
3. **La navegación es un dato** (`components/shell/navigation.ts`) y los tests exigen que cada destino
   tenga icono y ruta. Restavor agents necesita su lista (`agentsMenu()`, `agentsMobileNav()`) y su
   clasificación de roles (`ShellRole`: el test obliga a clasificar cualquier rol nuevo).
4. **La marca.** `es.common.appName = "Restavor"` y `brandSuffix: "web"` (`src/i18n/es.ts`). El logotipo
   ("Restavor" grande y "web" pequeño) se pinta en `AppShell.tsx` y `components/Logo.tsx`. Hay que
   convertir el sufijo en una variable por producto ("web" o "agents") y dejar "Restavor" solo para la
   puerta común.
5. **Textos**: todo en `src/i18n/es.ts`; una sección nueva `agents`.

**Base de datos**
6. **Decidir la unidad de aislamiento de Restavor agents.** Si es "un cliente con sus agentes" y el
   cliente es el mismo restaurante, lo natural es colgar de `establishments` (y por tanto de un
   `space_id`). Si Restavor agents es un producto de Restavor sin espacios de mantenimiento, necesitará
   su propia unidad de inquilino (una tabla tipo `agent_workspaces`) y sus propias membresías, siguiendo
   el mismo patrón que `spaces`/`space_memberships`. **Esta es la decisión que más condiciona el resto.**
7. **Qué productos tiene cada cuenta.** Hoy no hay ningún concepto de "producto" ni de "derecho de uso"
   por cuenta. La puerta común necesita saber a cuál de las dos partes puede entrar cada persona: o se
   deriva (tiene al menos una membresía en Restavor agents) o se guarda en una tabla nueva, por ejemplo
   `account_products`. Como `my_contexts()`, debería ser una función `SECURITY DEFINER` que devuelva lo
   que la persona puede abrir.
8. **Las reglas duras de `CLAUDE.md` se aplican a toda tabla nueva:** `space_id NOT NULL` si pertenece a
   un espacio; RLS con políticas explícitas; ningún `DELETE`; auditoría; eventos de estado; idempotencia
   en lo crítico; `timestamptz`; el disparador `<tabla>_guard_support_read_only` o la justificación en la
   suite 42; privilegios de columna si hay identidad del equipo; `revoke … from public, anon,
   authenticated` en las funciones internas. Y cada regla `RN-xxx` nueva, con su test SQL que la cite.
9. **Modo soporte y plataforma**: si Restavor agents tiene inquilinos, `is_space_member()` /
   `has_capability_as()` (o sus equivalentes) tienen que reconocer `support_sessions`, y el panel de
   Administración necesita sus secciones. Todo lo de plataforma tiene que pasar por
   `is_platform_owner()`/`is_platform_member()` (2FA).
10. **Avisos**: `notifications.event_type` y `entity_type` son listas `CHECK` cerradas; cada aviso nuevo
    es una migración que las amplía, más las preferencias y las plantillas de correo.

**Cobro**
11. Si Restavor agents se cobra, **decidir a qué flujo pertenece**: al restaurante como un servicio más
    (`services.kind` tendría que admitir un valor nuevo; hoy es `daily_menu | other`), o a la plataforma
    como `cuotly_subscriptions` (hoy `pro | agency`). Sigue sin Stripe y sin facturas mientras no llegue
    el bloque legal.

**IA**
12. La IA vive en `src/services/` (`@anthropic-ai/sdk`, modelos fijados por archivo) y deja el coste en
    `ai_usage`, que hoy exige `request_id` y `classification_id`. Los agentes necesitarían su propia tabla
    de uso, o generalizar esa. El principio P5 ("la IA propone, una persona valida") tiene hoy una única
    excepción escrita (los créditos, RN-CRE-09). **Un agente que actúa solo necesita una excepción
    decidida por Bosco.**

**Documentación y proceso**
13. Una sección nueva del PRD (familia `RN-AGT-xx`, por ejemplo), la decisión en `DECISIONES.md`, un hito
    en el ROADMAP y la actualización de `CLAUDE.md`, que hoy dice "Agente Restavor web: solo existe la
    entrada de menú con la etiqueta Próximamente. Sin funcionalidad simulada".

**Móvil y despliegue**
14. La app Expo reutiliza `navigation.ts` e `i18n`, así que heredaría la puerta común, pero hoy está
    parada (apartado 10). En Vercel puede ser el mismo proyecto (una sola app Next con las dos partes y
    **una sola sesión**, que es lo que da el "único acceso" sin esfuerzo) o dos proyectos en dos
    subdominios (`app.restavor.com`, `agents.restavor.com`). Con dos subdominios, la cookie de Supabase
    es de cada uno y hay que compartir sesión entre ellos, que es más trabajo. **Recomendación técnica:
    un solo proyecto y un solo dominio** mientras sea posible.

---

## Anexo C · Capturas

Hechas el 28/09/2026 con Playwright contra la web **local** (`scripts/supabase-local/arrancar.sh`: las
155 migraciones más el espacio de demostración `demo`, sin Storage ni correo), en
`docs/capturas-restavor-web/`. **Los datos son los del sembrado de demostración, no de producción.**
Como el sembrado sigue en el catálogo antiguo (apartado 11.3), **antes de capturar se pasó a créditos
solo en esa base local**, con los valores de la migración 154. Se ha hecho sin tocar el repositorio ni
producción: Impulso 99 € y 20 créditos y Premium 199 € y 40, los dos con Menú Diario; Impulso+ y
Premium+ archivados; Bar Demo en Impulso y Magariños en Premium; y lo ya pedido valorado según la tabla
de RN-CRE-06 (0,5 de procesamiento más el trabajo: 1 crédito un cambio simple, 1,5 una foto, 2,5 un
cambio de sección). Escritorio a 1440 px y móvil a 390 px. El panel
de Administración no se capturó: exige la 2FA de un miembro de la plataforma, y el sembrado no tiene
ninguno.

Equipo: `owner@cuotly.test` (propietaria del espacio `demo`). Cliente: `magarinos@cuotly.test` (propietaria local de «Magariños», con Menú Diario).

| Archivo | Pantalla | Ruta |
|---|---|---|
| [`acceso-01-entrar.png`](capturas-restavor-web/acceso-01-entrar.png) | Entrar (correo y contraseña) | `/login` |
| [`acceso-02-solicitar-acceso.png`](capturas-restavor-web/acceso-02-solicitar-acceso.png) | Solicitud de acceso (sustituye al registro) | `/signup` |
| [`equipo-01-inicio-global.png`](capturas-restavor-web/equipo-01-inicio-global.png) | Inicio global del propietario | `/` |
| [`equipo-02-inicio-espacio.png`](capturas-restavor-web/equipo-02-inicio-espacio.png) | Inicio del espacio de mantenimiento | `/espacios/demo` |
| [`equipo-03-restaurantes.png`](capturas-restavor-web/equipo-03-restaurantes.png) | Restaurantes | `/espacios/demo/restaurantes` |
| [`equipo-04-ficha-restaurante.png`](capturas-restavor-web/equipo-04-ficha-restaurante.png) | Ficha interna de un restaurante | `/espacios/demo/restaurantes/<id>` |
| [`equipo-05-solicitudes.png`](capturas-restavor-web/equipo-05-solicitudes.png) | Solicitudes | `/espacios/demo/solicitudes` |
| [`equipo-06-trabajos.png`](capturas-restavor-web/equipo-06-trabajos.png) | Trabajos | `/espacios/demo/trabajos` |
| [`equipo-07-tareas.png`](capturas-restavor-web/equipo-07-tareas.png) | Tareas | `/espacios/demo/tareas` |
| [`equipo-08-menu-diario.png`](capturas-restavor-web/equipo-08-menu-diario.png) | Menú Diario (equipo) | `/espacios/demo/menu-diario` |
| [`equipo-09-mensajes.png`](capturas-restavor-web/equipo-09-mensajes.png) | Mensajes | `/espacios/demo/mensajes` |
| [`equipo-10-calendario.png`](capturas-restavor-web/equipo-10-calendario.png) | Calendario | `/espacios/demo/calendario` |
| [`equipo-11-finanzas.png`](capturas-restavor-web/equipo-11-finanzas.png) | Finanzas | `/espacios/demo/finanzas` |
| [`equipo-12-informes.png`](capturas-restavor-web/equipo-12-informes.png) | Informes | `/espacios/demo/informes` |
| [`equipo-13-equipo.png`](capturas-restavor-web/equipo-13-equipo.png) | Equipo | `/espacios/demo/equipo` |
| [`equipo-14-planes.png`](capturas-restavor-web/equipo-14-planes.png) | Planes y servicios | `/espacios/demo/planes` |
| [`equipo-15-ajustes.png`](capturas-restavor-web/equipo-15-ajustes.png) | Ajustes del espacio | `/espacios/demo/ajustes` |
| [`equipo-16-agente-proximamente.png`](capturas-restavor-web/equipo-16-agente-proximamente.png) | Agente Restavor web («Próximamente») | `/espacios/demo/agente` |
| [`equipo-17-ayuda.png`](capturas-restavor-web/equipo-17-ayuda.png) | Ayuda | `/espacios/demo/ayuda` |
| [`cliente-01-inicio-global.png`](capturas-restavor-web/cliente-01-inicio-global.png) | Inicio global de un cliente | `/` |
| [`cliente-02-panel-inicio.png`](capturas-restavor-web/cliente-02-panel-inicio.png) | Panel del restaurante · Inicio | `…/restaurantes/<id>` |
| [`cliente-03-solicitudes.png`](capturas-restavor-web/cliente-03-solicitudes.png) | Solicitudes | `…/solicitudes` |
| [`cliente-04-nueva-solicitud.png`](capturas-restavor-web/cliente-04-nueva-solicitud.png) | Nueva solicitud | `…/solicitudes/nueva` |
| [`cliente-05-menu-diario.png`](capturas-restavor-web/cliente-05-menu-diario.png) | Menú Diario | `…/menu-diario` |
| [`cliente-06-mensajes.png`](capturas-restavor-web/cliente-06-mensajes.png) | Mensajes | `…/mensajes` |
| [`cliente-07-calendario.png`](capturas-restavor-web/cliente-07-calendario.png) | Calendario | `…/calendario` |
| [`cliente-08-plan-y-servicios.png`](capturas-restavor-web/cliente-08-plan-y-servicios.png) | Plan y servicios | `…/plan` |
| [`cliente-09-pagos-y-facturas.png`](capturas-restavor-web/cliente-09-pagos-y-facturas.png) | Pagos y facturas | `…/facturacion` |
| [`cliente-10-informes-y-datos.png`](capturas-restavor-web/cliente-10-informes-y-datos.png) | Informes y datos | `…/datos` |
| [`cliente-11-archivos.png`](capturas-restavor-web/cliente-11-archivos.png) | Archivos | `…/archivos` |
| [`cliente-12-usuarios-y-accesos.png`](capturas-restavor-web/cliente-12-usuarios-y-accesos.png) | Usuarios y accesos | `…/usuarios` |
| [`cliente-13-ajustes-y-ayuda.png`](capturas-restavor-web/cliente-13-ajustes-y-ayuda.png) | Ajustes y ayuda | `…/ajustes` |
| [`equipo-02-inicio-espacio-movil.png`](capturas-restavor-web/equipo-02-inicio-espacio-movil.png) | Inicio del espacio, móvil | `/espacios/demo` |
| [`equipo-04-ficha-restaurante-movil.png`](capturas-restavor-web/equipo-04-ficha-restaurante-movil.png) | Ficha del restaurante, móvil | `…/restaurantes/<id>` |
| [`cliente-02-panel-inicio-movil.png`](capturas-restavor-web/cliente-02-panel-inicio-movil.png) | Panel del restaurante, móvil | `…/restaurantes/<id>` |
| [`cliente-03-solicitudes-movil.png`](capturas-restavor-web/cliente-03-solicitudes-movil.png) | Solicitudes del cliente, móvil | `…/solicitudes` |

---

## Anexo A · Todas las columnas de las 119 tablas

Generado del catálogo de una base con las 155 migraciones aplicadas. `?` = admite nulo; sin `?` = `NOT NULL`.
Tipos: `uuid`, `text`, `integer`, `bigint`, `smallint`, `numeric`, `boolean`, `date`, `timestamptz`,
`jsonb`, `tsvector`, `text[]`; `space_role` y `member_status` son los dos enum.

- **`absences`**: `id` uuid, `space_id` uuid, `user_id` uuid, `starts_on` date, `ends_on` date, `reason` text?, `state` text, `decided_by` uuid?, `decided_at` timestamptz?, `decision_note` text?, `created_at` timestamptz
- **`acceptances`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `request_id` uuid, `job_id` uuid?, `category` text, `consumption_cycle_id` uuid?, `consumption_entry_id` uuid?, `budgeted` boolean, `accepted_by` uuid?, `accepted_at` timestamptz, `free_of_charge` boolean, `credits_half` integer?
- **`access_request_events`**: `id` uuid, `request_id` uuid, `from_status` text?, `to_status` text, `actor_id` uuid?, `reason` text?, `created_at` timestamptz
- **`access_requests`**: `id` uuid, `contact_name` text, `business_name` text, `phone` text, `email` text, `comments` text?, `status` text, `status_reason` text?, `applicant_reply` text?, `follow_up_token` uuid, `decided_at` timestamptz?, `decided_by` uuid?, `account_id` uuid?, `idempotency_key` text?, `created_at` timestamptz, `updated_at` timestamptz, `tax_id` text?, `tax_id_country` text?, `tax_id_verification` text?, `tax_id_registry_name` text?
- **`account_setup_tokens`**: `id` uuid, `token` uuid, `access_request_id` uuid, `email` text, `expires_at` timestamptz, `used_at` timestamptz?, `used_by` uuid?, `created_at` timestamptz
- **`ai_usage`**: `id` uuid, `space_id` uuid, `request_id` uuid, `classification_id` uuid, `model` text, `input_tokens` integer, `output_tokens` integer, `estimated_cost_cents` integer, `created_at` timestamptz, `estimated_cost_millicents` integer
- **`assignment_weights`**: `id` uuid, `space_id` uuid, `criterion` text, `weight` numeric, `created_by` uuid?, `created_at` timestamptz
- **`assignments`**: `id` uuid, `space_id` uuid, `job_id` uuid, `assignee_id` uuid, `assigned_by` uuid?, `kind` text, `reason` text?, `assigned_at` timestamptz, `released_at` timestamptz?
- **`audit_log`**: `id` uuid, `space_id` uuid?, `actor_id` uuid?, `action` text, `entity_type` text, `entity_id` uuid?, `old_value` jsonb?, `new_value` jsonb?, `reason` text?, `created_at` timestamptz, `support_session_id` uuid?
- **`blocks`**: `id` uuid, `space_id` uuid, `job_id` uuid, `reason_type` text, `note` text?, `started_at` timestamptz, `started_by` uuid?, `ended_at` timestamptz?, `ended_by` uuid?, `reverted` boolean
- **`channel_members`**: `id` uuid, `space_id` uuid, `conversation_id` uuid, `user_id` uuid, `added_by` uuid?, `created_at` timestamptz, `revoked_at` timestamptz?, `revoked_by` uuid?
- **`charges`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid?, `concept` text, `period_start` timestamptz, `period_end` timestamptz, `base_cents` integer, `tax_rate_percent` numeric, `tax_cents` integer, `total_cents` integer, `due_at` timestamptz, `issued_at` timestamptz, `issued_by` uuid?, `created_at` timestamptz, `quote_id` uuid?
- **`classifications`**: `id` uuid, `request_id` uuid, `space_id` uuid, `source` text, `proposed_category` text, `proposed_summary` text, `matched_keywords` text[]?, `model` text?, `input_tokens` integer?, `output_tokens` integer?, `fallback_reason` text?, `decided_category` text?, `decided_summary` text?, `decided_by` uuid?, `decided_at` timestamptz?, `created_at` timestamptz, `proposed_credits_half` integer?, `proposed_breakdown` jsonb?, `prompt_version` text?, `decided_credits_half` integer?
- **`consumption_cycles`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid, `cycle_start` timestamptz, `cycle_end` timestamptz, `included_small` integer, `included_photo` integer, `included_medium` integer, `included_large` integer, `created_at` timestamptz, `included_credits_half` integer
- **`consumption_entries`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `consumption_cycle_id` uuid, `category` text, `amount` integer, `entry_type` text, `request_id` uuid?, `job_id` uuid?, `related_entry_id` uuid?, `reason` text?, `created_by` uuid?, `created_at` timestamptz
- **`conversation_reads`**: `conversation_id` uuid, `user_id` uuid, `space_id` uuid, `last_read_at` timestamptz
- **`conversations`**: `id` uuid, `space_id` uuid, `type` text, `request_id` uuid?, `created_at` timestamptz, `job_id` uuid?, `establishment_id` uuid?, `name` text?, `archived_at` timestamptz?, `archived_by` uuid?
- **`corrections`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `job_id` uuid, `request_id` uuid, `kind` text, `description` text, `requested_by` uuid?, `requested_at` timestamptz, `started_at` timestamptz?, `completed_at` timestamptz?, `completed_by` uuid?
- **`cuotly_charges`**: `id` uuid, `space_id` uuid, `subscription_id` uuid, `kind` text, `concept` text, `reference` text, `period_start` timestamptz, `period_end` timestamptz, `base_cents` integer, `tax_rate_percent` numeric, `tax_cents` integer, `total_cents` integer, `breakdown` jsonb, `due_at` timestamptz, `issued_at` timestamptz, `created_at` timestamptz
- **`cuotly_ledger_entries`**: `id` uuid, `space_id` uuid, `charge_id` uuid, `entry_type` text, `amount_cents` integer, `payment_id` uuid?, `reason` text?, `created_by` uuid?, `created_at` timestamptz
- **`cuotly_payments`**: `id` uuid, `space_id` uuid, `charge_id` uuid, `amount_cents` integer, `method` text, `paid_at` timestamptz, `receipt_reference` text?, `receipt_file_id` uuid?, `note` text?, `declared_by` uuid, `declared_side` text, `declared_at` timestamptz, `confirmed_at` timestamptz?, `confirmed_by` uuid?, `rejected_at` timestamptz?, `rejected_by` uuid?, `rejection_reason` text?, `reversed_at` timestamptz?, `reversed_by` uuid?, `reversal_reason` text?, `idempotency_key` text?, `created_at` timestamptz
- **`cuotly_subscriptions`**: `id` uuid, `space_id` uuid, `plan` text, `extra_establishments` integer, `extra_users` integer, `current_period_start` timestamptz, `current_period_end` timestamptz, `pending_plan` text?, `pending_extra_establishments` integer, `pending_extra_users` integer, `pending_requested_at` timestamptz?, `created_at` timestamptz, `updated_at` timestamptz
- **`establishment_backup_downloads`**: `id` uuid, `space_id` uuid, `backup_id` uuid, `downloaded_by` uuid, `downloaded_at` timestamptz
- **`establishment_backups`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `taken_at` timestamptz, `content` jsonb, `size_bytes` bigint, `item_counts` jsonb, `created_by` uuid?
- **`establishment_invitations`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `email` text, `role` text, `edit_establishment_data` boolean, `view_billing` boolean, `status` text, `token` uuid, `expires_at` timestamptz?, `invited_by` uuid, `reviewed_by` uuid?, `reviewed_at` timestamptz?, `rejection_reason` text?, `accepted_by` uuid?, `accepted_at` timestamptz?, `idempotency_key` text?, `created_at` timestamptz, `updated_at` timestamptz
- **`establishment_managers`**: `establishment_id` uuid, `space_id` uuid, `manager_id` uuid, `assigned_at` timestamptz, `assigned_by` uuid?
- **`establishment_memberships`**: `id` uuid, `establishment_id` uuid, `user_id` uuid, `role` text, `created_at` timestamptz, `revoked_at` timestamptz?, `revoked_by` uuid?
- **`establishment_notes`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `body` text, `operational` boolean, `created_by` uuid, `created_at` timestamptz, `archived_at` timestamptz?, `archived_by` uuid?, `archived_reason` text?
- **`establishment_permissions`**: `establishment_membership_id` uuid, `edit_establishment_data` boolean, `view_billing` boolean, `create_requests` boolean, `edit_menus` boolean, `use_messages` boolean, `upload_files` boolean, `manage_users` boolean, `view_reports` boolean
- **`establishment_transfers`**: `id` uuid, `establishment_id` uuid, `from_space_id` uuid, `to_space_id` uuid, `state` text, `reason` text?, `proposed_by` uuid, `proposed_at` timestamptz, `decided_by` uuid?, `decided_at` timestamptz?, `decision_reason` text?
- **`establishments`**: `id` uuid, `space_id` uuid, `group_id` uuid, `code` text, `name` text, `status` text, `created_at` timestamptz, `legal_name` text?, `tax_id` text?, `address` text?, `postal_code` text?, `city` text?, `contact_email` text?, `phone_primary` text?, `phone_secondary` text?, `website_url` text?, `domain` text?, `opening_hours` text?, `web_platform` text?, `contact_name` text?, `instagram` text?, `facebook_url` text?, `idempotency_key` text?, `photo_file_id` uuid?, `platform_archived_at` timestamptz?, `permanently_deleted_at` timestamptz?
- **`file_links`**: `id` uuid, `file_id` uuid, `space_id` uuid, `entity_type` text, `entity_id` uuid, `created_by` uuid, `created_at` timestamptz
- **`file_versions`**: `id` uuid, `file_id` uuid, `space_id` uuid, `version_number` integer, `storage_path` text, `file_name` text, `mime_type` text, `size_bytes` bigint, `variant` text?, `checksum` text?, `created_by` uuid, `created_at` timestamptz
- **`files`**: `id` uuid, `space_id` uuid, `group_id` uuid, `establishment_id` uuid, `category` text, `visibility` text, `name` text, `archived_at` timestamptz?, `archived_by` uuid?, `deletion_requested_at` timestamptz?, `deletion_requested_by` uuid?, `deletion_reason` text?, `created_by` uuid, `created_at` timestamptz
- **`financial_entries`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `charge_id` uuid, `entry_type` text, `amount_cents` integer, `payment_id` uuid?, `related_entry_id` uuid?, `reason` text?, `created_by` uuid?, `created_at` timestamptz, `idempotency_key` text?
- **`group_memberships`**: `id` uuid, `group_id` uuid, `user_id` uuid, `role` text, `created_at` timestamptz, `revoked_at` timestamptz?, `revoked_by` uuid?
- **`groups`**: `id` uuid, `space_id` uuid, `name` text, `created_at` timestamptz, `description` text?, `idempotency_key` text?
- **`help_articles`**: `id` uuid, `slug` text, `topic` text, `audience` text[], `title` text, `body` text, `version` integer, `published` boolean, `updated_at` timestamptz, `search` tsvector?
- **`holidays`**: `id` uuid, `space_id` uuid, `holiday_date` date, `name` text, `created_by` uuid?, `created_at` timestamptz
- **`incident_attachments`**: `id` uuid, `space_id` uuid, `incident_id` uuid, `message_id` uuid?, `uploaded_by` uuid, `uploader_side` text, `name` text, `content_type` text, `size_bytes` bigint, `storage_path` text, `created_at` timestamptz
- **`incident_events`**: `id` uuid, `space_id` uuid, `incident_id` uuid, `from_status` text?, `to_status` text, `actor_id` uuid, `actor_side` text, `reason` text?, `occurred_at` timestamptz
- **`incident_messages`**: `id` uuid, `space_id` uuid, `incident_id` uuid, `author_id` uuid, `author_side` text, `body` text, `created_at` timestamptz
- **`incidents`**: `id` uuid, `space_id` uuid, `opened_by` uuid, `kind` text, `category` text, `description` text, `impact` text?, `device` text?, `app_version` text?, `client_context` jsonb, `help_query` text?, `status` text, `status_reason` text?, `opened_at` timestamptz, `first_platform_response_at` timestamptz?, `resolved_at` timestamptz?, `closed_at` timestamptz?, `last_activity_at` timestamptz, `idempotency_key` text?
- **`integration_credentials`**: `id` uuid, `space_id` uuid, `integration_id` uuid, `kind` text, `ciphertext` text, `key_version` integer, `expires_at` timestamptz?, `created_by` uuid?, `created_at` timestamptz, `replaced_at` timestamptz?, `revoked_at` timestamptz?
- **`integrations`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `provider` text, `status` text, `auth_kind` text, `account_label` text?, `external_property_id` text?, `last_sync_at` timestamptz?, `last_success_at` timestamptz?, `next_attempt_at` timestamptz?, `last_error` text?, `last_failure_kind` text?, `consecutive_failures` integer, `external_revocation_pending` boolean, `connected_at` timestamptz?, `connected_by` uuid?, `disconnected_at` timestamptz?, `disconnected_by` uuid?, `disconnect_reason` text?, `created_by` uuid?, `created_at` timestamptz, `updated_at` timestamptz, `external_revocation_attempts` integer
- **`internal_notes`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `job_id` uuid?, `kind` text, `body` text, `author_id` uuid, `created_at` timestamptz
- **`jobs`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `request_id` uuid, `code` text, `state` text, `category` text, `started_at` timestamptz?, `cancelled_reason` text?, `cancelled_by` uuid?, `cancelled_at` timestamptz?, `created_at` timestamptz, `assigned_to` uuid?, `assigned_at` timestamptz?, `started_by` uuid?, `published_at` timestamptz?, `published_by` uuid?, `completed_at` timestamptz?, `free_correction_used_at` timestamptz?, `correction_window_ends_at` timestamptz?, `required_specialty` text?, `quote_id` uuid?, `execution_sla_hours` integer?, `credits_half` integer?
- **`menu_corrections`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `menu_id` uuid, `publication_id` uuid, `kind` text, `description` text, `requested_by` uuid, `requested_at` timestamptz, `requested_before_cutoff` boolean, `completed_at` timestamptz?, `completed_by` uuid?, `completion_note` text?
- **`menu_downloads`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `menu_id` uuid, `version_id` uuid, `template_id` uuid, `format` text, `by_team` boolean, `downloaded_by` uuid, `downloaded_at` timestamptz, `printed` boolean
- **`menu_events`**: `id` uuid, `space_id` uuid, `menu_id` uuid, `publication_id` uuid?, `from_state` text?, `to_state` text, `actor_id` uuid?, `reason` text?, `occurred_at` timestamptz
- **`menu_publications`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `menu_id` uuid, `requested_by` uuid, `requested_at` timestamptz, `requested_version_id` uuid, `idempotency_key` text?, `cycle_id` uuid?, `debit_entry_id` uuid?, `requested_before_cutoff` boolean, `assigned_to` uuid?, `assigned_at` timestamptz?, `assignment_mode` text?, `published_by` uuid?, `published_at` timestamptz?, `published_version_id` uuid?, `published_template_id` uuid?, `cancelled_by` uuid?, `cancelled_at` timestamptz?, `cancel_reason` text?, `created_at` timestamptz
- **`menu_templates`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `name` text, `origin` text, `archived_at` timestamptz?, `archived_by` uuid?, `created_by` uuid, `created_at` timestamptz, `layout` text, `background_color` text, `text_color` text, `accent_color` text, `heading_text` text?, `footer_text` text?, `show_prices` boolean, `design_updated_at` timestamptz?, `quote_id` uuid?, `purpose` text
- **`menu_update_cycles`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid, `cycle_start` timestamptz, `cycle_end` timestamptz, `included_updates` integer, `created_at` timestamptz
- **`menu_update_entries`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `cycle_id` uuid, `amount` integer, `entry_type` text, `menu_id` uuid?, `publication_id` uuid?, `related_entry_id` uuid?, `reason` text?, `created_by` uuid?, `created_at` timestamptz
- **`menu_versions`**: `id` uuid, `space_id` uuid, `menu_id` uuid, `version` integer, `starters` text[], `mains` text[], `desserts` text[], `drink` text?, `price_cents` integer?, `note` text?, `after_cutoff` boolean, `created_by` uuid, `created_at` timestamptz, `allergens` jsonb?, `allergen_note` text?
- **`menus`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `name` text, `kind` text, `target_date` date, `template_id` uuid?, `state` text, `current_version_id` uuid?, `published_at` timestamptz?, `published_version_id` uuid?, `published_template_id` uuid?, `cancelled_at` timestamptz?, `created_by` uuid, `created_at` timestamptz, `updated_at` timestamptz
- **`message_edits`**: `id` uuid, `message_id` uuid, `space_id` uuid, `version` integer, `previous_body` text, `edited_by` uuid, `edited_at` timestamptz
- **`messages`**: `id` uuid, `conversation_id` uuid, `space_id` uuid, `sender_id` uuid, `sender_role` text, `body` text, `created_at` timestamptz, `edited_at` timestamptz?, `edit_count` integer, `idempotency_key` text?
- **`metric_points`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `integration_id` uuid, `provider` text, `metric` text, `dimension` text, `period_start` date, `period_end` date, `value` numeric, `unit` text?, `sync_run_id` uuid?, `fetched_at` timestamptz
- **`notification_deliveries`**: `id` uuid, `space_id` uuid, `notification_id` uuid?, `channel` text, `status` text, `attempts` integer, `next_attempt_at` timestamptz, `last_error` text?, `sent_at` timestamptz?, `provider_message_id` text?, `digest_id` uuid?
- **`notification_digest_items`**: `space_id` uuid, `digest_id` uuid, `notification_id` uuid
- **`notification_digests`**: `id` uuid, `space_id` uuid, `profile_id` uuid, `digest_date` date, `notification_count` integer, `created_at` timestamptz
- **`notification_preferences`**: `id` uuid, `space_id` uuid, `profile_id` uuid, `event_type` text, `in_app` boolean, `email` boolean, `updated_at` timestamptz, `push` boolean
- **`notification_schedules`**: `id` uuid, `space_id` uuid, `profile_id` uuid, `frequency` text, `updated_at` timestamptz
- **`notifications`**: `id` uuid, `space_id` uuid, `recipient_id` uuid, `event_type` text, `audience` text, `entity_type` text, `entity_id` uuid, `establishment_id` uuid?, `deep_link` text, `threshold_percent` integer?, `amount_cents` bigint?, `dedupe_key` text, `created_at` timestamptz, `read_at` timestamptz?
- **`opportunities`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `origin` text, `rule_key` text?, `subject` text, `category` text, `scope` text, `title` text?, `description` text?, `recommended_action` text?, `potential_service_id` uuid?, `impact` text, `priority` integer, `effort_category` text?, `include_in_report` boolean, `status` text, `status_reason` text?, `evidence` jsonb, `period_start` date?, `period_end` date?, `severity` numeric, `first_detected_at` timestamptz?, `last_detected_at` timestamptz?, `detection_count` integer, `proposal_edited_at` timestamptz?, `proposal_edited_by` uuid?, `approved_at` timestamptz?, `approved_by` uuid?, `discarded_at` timestamptz?, `discarded_by` uuid?, `discard_reason` text?, `discarded_severity` numeric?, `discarded_period_end` date?, `reopened_at` timestamptz?, `created_by` uuid?, `updated_by` uuid?, `created_at` timestamptz, `updated_at` timestamptz
- **`opportunity_detections`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `opportunity_id` uuid, `period_start` date, `period_end` date, `severity` numeric, `evidence` jsonb, `detected_at` timestamptz
- **`opportunity_notes`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `opportunity_id` uuid, `kind` text, `body` text, `author_id` uuid, `created_at` timestamptz
- **`payment_confirmations`**: `id` uuid, `space_id` uuid, `payment_id` uuid, `confirmed_by` uuid, `confirmed_role` text, `confirmed_at` timestamptz, `note` text?
- **`payments`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `charge_id` uuid, `amount_cents` integer, `method` text, `paid_at` timestamptz, `receipt_file_id` uuid?, `recorded_by` uuid, `recorded_role` text, `idempotency_key` text?, `reversed_at` timestamptz?, `reversed_by` uuid?, `reversal_reason` text?, `created_at` timestamptz
- **`plan_commitments`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid, `plan_id` uuid?, `started_at` timestamptz, `ends_at` timestamptz, `cause` text, `created_by` uuid?, `created_at` timestamptz, `service_id` uuid?
- **`plan_versions`**: `id` uuid, `space_id` uuid, `plan_id` uuid, `version` integer, `conditions` text, `published_by` uuid, `published_at` timestamptz
- **`plans`**: `id` uuid, `space_id` uuid, `name` text, `price_cents` integer, `included_small` integer, `included_photo` integer, `included_medium` integer, `included_large` integer, `start_sla_hours` integer, `created_at` timestamptz, `grants_priority` boolean, `queue_rank` smallint, `can_order_requests` boolean, `report_level` text, `watches_reviews` boolean, `execution_sla_small` integer, `execution_sla_photo` integer, `execution_sla_medium` integer, `execution_sla_large` integer, `lineage_id` uuid, `revision` integer, `supersedes_id` uuid?, `published_at` timestamptz, `published_by` uuid?, `superseded_at` timestamptz?, `archived_at` timestamptz?, `publish_key` text?, `report_period` text, `included_credits_half` integer, `includes_daily_menu` boolean
- **`platform_account_closures`**: `id` uuid, `user_id` uuid, `actor_id` uuid, `reason` text, `closed_at` timestamptz, `details` jsonb, `restored_at` timestamptz?, `restored_by` uuid?, `restore_reason` text?
- **`platform_emails`**: `id` uuid, `kind` text, `to_email` text, `payload` jsonb, `dedupe_key` text?, `status` text, `attempts` integer, `next_attempt_at` timestamptz, `last_error` text?, `sent_at` timestamptz?, `provider_message_id` text?, `created_at` timestamptz
- **`platform_holidays`**: `id` uuid, `holiday_date` date, `name` text, `created_by` uuid, `created_at` timestamptz, `removed_at` timestamptz?, `removed_by` uuid?, `removal_reason` text?
- **`platform_roles`**: `user_id` uuid, `role` text, `created_at` timestamptz, `can_approve_spaces` boolean, `can_manage_subscriptions` boolean, `can_support` boolean, `can_delete_accounts` boolean
- **`platform_status_events`**: `id` uuid, `component` text, `severity` text, `title` text, `body` text?, `started_at` timestamptz, `resolved_at` timestamptz?, `resolution_note` text?, `created_by` uuid, `resolved_by` uuid?, `created_at` timestamptz, `security` boolean
- **`profile_notification_preferences`**: `id` uuid, `profile_id` uuid, `event_type` text, `in_app` boolean, `email` boolean, `push` boolean, `updated_at` timestamptz
- **`profiles`**: `id` uuid, `email` text, `full_name` text?, `created_at` timestamptz, `given_name` text?, `family_name` text?, `phone` text?, `display_timezone` text?, `avatar_path` text?
- **`push_devices`**: `id` uuid, `user_id` uuid, `expo_push_token` text, `platform` text, `device_name` text?, `app_version` text?, `created_at` timestamptz, `last_seen_at` timestamptz, `revoked_at` timestamptz?, `revoked_reason` text?
- **`quotes`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `request_id` uuid?, `code` text, `concept` text, `description` text?, `outcome` text, `category` text?, `base_cents` integer, `tax_rate_percent` numeric, `tax_cents` integer, `total_cents` integer, `requires_payment_before_start` boolean, `state` text, `sent_at` timestamptz?, `sent_by` uuid?, `decided_at` timestamptz?, `decided_by` uuid?, `decision_reason` text?, `decided_by_team` boolean, `start_authorized_at` timestamptz?, `start_authorized_by` uuid?, `start_authorization_reason` text?, `created_by` uuid, `created_at` timestamptz, `updated_at` timestamptz
- **`receipts`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `charge_id` uuid, `file_id` uuid, `payment_id` uuid?, `uploaded_by` uuid, `uploaded_side` text, `note` text?, `created_at` timestamptz
- **`report_deliveries`**: `id` uuid, `space_id` uuid, `report_id` uuid, `version_id` uuid, `recipient_id` uuid, `channel` text, `sent_at` timestamptz
- **`report_entry_texts`**: `id` uuid, `space_id` uuid, `report_id` uuid, `entry_key` text, `title` text?, `body` text?, `updated_by` uuid?, `updated_at` timestamptz
- **`report_sections`**: `id` uuid, `space_id` uuid, `report_id` uuid, `section_key` text, `position` integer, `included` boolean, `note` text?, `updated_by` uuid?, `updated_at` timestamptz
- **`report_versions`**: `id` uuid, `space_id` uuid, `report_id` uuid, `version_number` integer, `snapshot` jsonb, `generated_at` timestamptz, `generated_by` uuid?
- **`reports`**: `id` uuid, `space_id` uuid, `establishment_id` uuid?, `group_id` uuid?, `category` text, `name` text, `period_start` date, `period_end` date, `filters` jsonb, `status` text, `status_reason` text?, `delivery_channel` text, `include_csv` boolean, `scheduled_for` timestamptz?, `reminder_sent_at` timestamptz?, `sent_at` timestamptz?, `approved_at` timestamptz?, `approved_by` uuid?, `archived_at` timestamptz?, `idempotency_key` text?, `created_by` uuid?, `updated_by` uuid?, `created_at` timestamptz, `updated_at` timestamptz
- **`request_attachments`**: `id` uuid, `request_id` uuid, `space_id` uuid, `establishment_id` uuid, `storage_path` text, `file_name` text, `mime_type` text, `size_bytes` bigint, `created_by` uuid, `created_at` timestamptz
- **`request_versions`**: `id` uuid, `request_id` uuid, `version_number` integer, `description` text, `context` text?, `created_by` uuid?, `created_at` timestamptz, `space_id` uuid
- **`requests`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `code` text, `state` text, `description` text, `context` text?, `created_by` uuid?, `copied_from_request_id` uuid?, `validated_category` text?, `validated_summary` text?, `validated_by` uuid?, `validated_at` timestamptz?, `accepted_by` uuid?, `accepted_at` timestamptz?, `rejected_reason` text?, `rejected_by` uuid?, `rejected_at` timestamptz?, `created_at` timestamptz, `accepted_start_sla_hours` integer?, `source_conversation_id` uuid?, `priority_rank` integer?, `opportunity_id` uuid?, `opportunity_action` text?, `priority` text?, `priority_reason` text?, `created_by_team` boolean, `on_behalf_reason` text?, `creation_idempotency_key` text?, `kind` text, `incident_outcome` text?, `incident_note` text?, `incident_resolved_at` timestamptz?, `validated_credits_half` integer?, `credit_breakdown` jsonb?, `credits_deferred_until` timestamptz?, `credits_deferred_by` uuid?, `quote_requested_at` timestamptz?
- **`reviews`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `integration_id` uuid, `external_id` text, `rating` smallint, `comment` text?, `author_name` text?, `reviewed_at` timestamptz, `reply_comment` text?, `replied_at` timestamptz?, `fetched_at` timestamptz, `created_at` timestamptz
- **`revision_acceptances`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid, `plan_id` uuid?, `service_id` uuid?, `channel` text, `accepted_by` uuid?, `recorded_by` uuid?, `accepted_at` timestamptz, `evidence_file_id` uuid?, `created_at` timestamptz
- **`scheduled_jobs`**: `id` uuid, `space_id` uuid, `kind` text, `run_after` timestamptz, `status` text, `attempts` integer, `last_error` text?, `dedupe_key` text, `created_at` timestamptz, `finished_at` timestamptz?
- **`scheduled_plan_changes`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid, `from_plan_id` uuid, `to_plan_id` uuid, `direction` text, `effective_at` timestamptz, `state` text, `requested_by` uuid?, `created_at` timestamptz, `applied_at` timestamptz?
- **`service_versions`**: `id` uuid, `space_id` uuid, `service_id` uuid, `version` integer, `conditions` text, `published_by` uuid, `published_at` timestamptz
- **`services`**: `id` uuid, `space_id` uuid, `name` text, `price_cents` integer, `price_premium_cents` integer?, `created_at` timestamptz, `kind` text, `included_updates` integer, `lineage_id` uuid, `revision` integer, `supersedes_id` uuid?, `published_at` timestamptz, `published_by` uuid?, `superseded_at` timestamptz?, `archived_at` timestamptz?, `publish_key` text?
- **`space_exports`**: `id` uuid, `space_id` uuid, `scope` text, `group_id` uuid?, `establishment_id` uuid?, `requested_by` uuid, `requested_at` timestamptz, `table_count` integer, `row_count` integer
- **`space_invitations`**: `id` uuid, `space_id` uuid, `email` text, `role` space_role, `invited_by` uuid, `token` uuid, `status` text, `expires_at` timestamptz, `created_at` timestamptz
- **`space_lifecycle_operations`**: `id` uuid, `space_id` uuid, `kind` text, `actor_id` uuid, `from_owner_id` uuid?, `to_owner_id` uuid?, `reason` text?, `idempotency_key` text?, `occurred_at` timestamptz
- **`space_memberships`**: `id` uuid, `space_id` uuid, `user_id` uuid, `role` space_role, `status` member_status, `created_at` timestamptz, `can_perform_jobs` boolean, `can_approve_reports` boolean
- **`space_onboarding_confirmations`**: `id` uuid, `space_id` uuid, `step` text, `confirmed_by` uuid, `confirmed_at` timestamptz
- **`space_request_events`**: `id` uuid, `request_id` uuid, `from_status` text?, `to_status` text, `actor_id` uuid?, `reason` text?, `created_at` timestamptz
- **`space_requests`**: `id` uuid, `requester_id` uuid, `business_name` text, `contact_name` text, `email` text, `phone` text?, `estimated_establishments` integer?, `estimated_users` integer?, `intended_use` text?, `plan` text, `tax_name` text?, `tax_id` text?, `tax_address` text?, `status` text, `status_reason` text?, `submitted_at` timestamptz?, `decided_at` timestamptz?, `decided_by` uuid?, `space_id` uuid?, `idempotency_key` text?, `created_at` timestamptz, `updated_at` timestamptz
- **`space_sequences`**: `space_id` uuid, `sequence_name` text, `next_value` bigint
- **`space_working_hours`**: `id` uuid, `space_id` uuid, `calendar_kind` text, `timezone` text, `effective_from` timestamptz, `created_by` uuid?, `created_at` timestamptz
- **`spaces`**: `id` uuid, `name` text, `slug` text, `timezone` text, `created_by` uuid, `created_at` timestamptz, `tax_rate_percent` numeric, `payment_term_days` integer, `cuotly_plan` text?, `cuotly_trial_ends_at` timestamptz?, `cuotly_status` text?, `cuotly_status_changed_at` timestamptz?, `cuotly_archived_at` timestamptz?, `cuotly_reactivation_deadline_at` timestamptz?, `legal_name` text?, `tax_id` text?, `address` text?, `logo_storage_path` text?, `onboarding_completed_at` timestamptz?, `cuotly_deletion_scheduled_at` timestamptz?, `permanently_deleted_at` timestamptz?
- **`state_events`**: `id` uuid, `space_id` uuid, `entity_type` text, `entity_id` uuid, `from_state` text?, `to_state` text, `actor_id` uuid?, `reason` text?, `occurred_at` timestamptz, `cause` text?
- **`subscriptions`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `kind` text, `plan_id` uuid?, `service_id` uuid?, `status` text, `started_at` timestamptz, `created_by` uuid?, `created_at` timestamptz
- **`supervisions`**: `id` uuid, `space_id` uuid, `worker_id` uuid, `admin_id` uuid, `kind` text, `starts_at` timestamptz, `ends_at` timestamptz?, `created_by` uuid?, `created_at` timestamptz, `revoked_at` timestamptz?
- **`support_sessions`**: `id` uuid, `space_id` uuid, `actor_id` uuid, `reason` text, `access_level` text, `started_at` timestamptz, `expires_at` timestamptz, `ended_at` timestamptz?, `end_note` text?, `idempotency_key` text?, `created_at` timestamptz
- **`sync_runs`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `integration_id` uuid, `kind` text, `status` text, `requested_by` uuid?, `period_start` date?, `period_end` date?, `started_at` timestamptz?, `finished_at` timestamptz?, `failure_kind` text?, `error` text?, `points_written` integer, `created_at` timestamptz
- **`task_reassignment_requests`**: `id` uuid, `space_id` uuid, `task_id` uuid, `requested_by` uuid, `reason` text, `requested_at` timestamptz, `state` text, `decided_by` uuid?, `decided_at` timestamptz?, `decision_reason` text?, `new_assignee_id` uuid?
- **`tasks`**: `id` uuid, `space_id` uuid, `establishment_id` uuid?, `job_id` uuid?, `title` text, `description` text?, `state` text, `weight` text, `estimated_minutes` integer, `assignee_id` uuid?, `created_by` uuid, `created_at` timestamptz, `started_at` timestamptz?, `completed_at` timestamptz?, `cancelled_at` timestamptz?, `cancelled_by` uuid?, `cancelled_reason` text?, `planned_date` date?
- **`terms_acceptances`**: `id` uuid, `space_id` uuid, `establishment_id` uuid, `subscription_id` uuid, `plan_version_id` uuid?, `service_version_id` uuid?, `channel` text, `accepted_by` uuid?, `recorded_by` uuid?, `accepted_at` timestamptz, `evidence_file_id` uuid?, `created_at` timestamptz
- **`timer_events`**: `id` uuid, `space_id` uuid, `counter_kind` text, `entity_type` text, `entity_id` uuid, `event_type` text, `occurred_at` timestamptz, `actor_id` uuid?, `created_at` timestamptz, `cause` text?
- **`worker_availability`**: `id` uuid, `space_id` uuid, `user_id` uuid, `available` boolean, `note` text?, `updated_at` timestamptz
- **`worker_establishments`**: `id` uuid, `space_id` uuid, `user_id` uuid, `establishment_id` uuid, `created_by` uuid?, `created_at` timestamptz, `revoked_at` timestamptz?, `revoked_by` uuid?
- **`worker_specialties`**: `id` uuid, `space_id` uuid, `user_id` uuid, `specialty` text, `created_by` uuid?, `created_at` timestamptz, `revoked_at` timestamptz?, `revoked_by` uuid?

---

## Anexo B · Las 155 migraciones

| Nº | Fecha | Nombre del archivo (sin fecha) |
|---:|---|---|
| 1 | 2026-08-30 | `profiles` |
| 2 | 2026-08-30 | `spaces` |
| 3 | 2026-08-30 | `groups_establishments` |
| 4 | 2026-08-30 | `invitations` |
| 5 | 2026-08-30 | `plans_services` |
| 6 | 2026-08-30 | `platform_and_audit` |
| 7 | 2026-08-30 | `capabilities` |
| 8 | 2026-08-30 | `rls_policies` |
| 9 | 2026-08-30 | `create_restavor_space` |
| 10 | 2026-08-30 | `fix_search_path` |
| 11 | 2026-08-30 | `establishment_code_default` |
| 12 | 2026-08-30 | `secure_next_space_sequence` |
| 13 | 2026-08-30 | `no_physical_delete_rls` |
| 14 | 2026-08-30 | `client_side_read_access` |
| 15 | 2026-08-30 | `fix_rls_recursion` |
| 16 | 2026-08-30 | `time_engine` |
| 17 | 2026-08-30 | `requests_and_classification` |
| 18 | 2026-08-30 | `hito4_audit_fixes` |
| 19 | 2026-08-30 | `restrict_can_write_establishment_as` |
| 20 | 2026-08-30 | `hito5_consumos` |
| 21 | 2026-08-30 | `hito5_review_fixes` |
| 22 | 2026-08-30 | `hito6_trabajos` |
| 23 | 2026-08-30 | `hito6_review_fixes` |
| 24 | 2026-08-30 | `revoke_internal_functions_from_roles` |
| 25 | 2026-08-30 | `hito7_mensajes_archivos_finanzas` |
| 26 | 2026-08-30 | `hito7_review_fixes` |
| 27 | 2026-08-30 | `fix_updatable_client_views` |
| 28 | 2026-08-30 | `hito7_review_fixes_2` |
| 29 | 2026-08-30 | `corrections_identity` |
| 30 | 2026-08-30 | `review4_fixes` |
| 31 | 2026-08-30 | `payment_methods` |
| 32 | 2026-08-30 | `review5_fixes` |
| 33 | 2026-08-30 | `service_stops_at_24h` |
| 34 | 2026-08-30 | `review6_fixes` |
| 35 | 2026-08-30 | `hito8_inicio_busqueda_notificaciones` |
| 36 | 2026-08-30 | `hito8_ausencias_busqueda_calendario` |
| 37 | 2026-08-30 | `fase1_review_fixes` |
| 38 | 2026-08-30 | `fase1_review_fixes_2` |
| 39 | 2026-08-30 | `fase1_review_fixes_3` |
| 40 | 2026-08-30 | `plan_change` |
| 41 | 2026-08-30 | `queue_and_sweeps` |
| 42 | 2026-08-30 | `hu05_sessions` |
| 43 | 2026-09-02 | `client_request_job` |
| 44 | 2026-09-02 | `retry_request_analysis` |
| 45 | 2026-09-03 | `storage_bucket_files` |
| 46 | 2026-09-03 | `consumption_threshold_client_only` |
| 47 | 2026-09-03 | `task_assignment` |
| 48 | 2026-09-03 | `hu07_service_subscriptions` |
| 49 | 2026-09-03 | `hu36_ajustes_auditoria` |
| 50 | 2026-09-04 | `bandeja_de_conversaciones` |
| 51 | 2026-09-04 | `borrador_de_solicitud` |
| 52 | 2026-09-08 | `cola_llena_y_vencimiento` |
| 53 | 2026-09-08 | `cobro_de_mejora_en_el_libro` |
| 54 | 2026-09-08 | `inicio_del_espacio` |
| 55 | 2026-09-08 | `ficha_del_restaurante` |
| 56 | 2026-09-09 | `compartir_con_el_restaurante` |
| 57 | 2026-09-09 | `datos_del_establecimiento` |
| 58 | 2026-09-10 | `alta_del_restaurante` |
| 59 | 2026-09-10 | `instagram_del_restaurante` |
| 60 | 2026-09-10 | `evidencia_de_publicacion` |
| 61 | 2026-09-10 | `acceso_revocado_en_la_ficha` |
| 62 | 2026-09-10 | `prioridad_del_restaurante` |
| 63 | 2026-09-10 | `premium_concede_prioridad` |
| 64 | 2026-09-11 | `la_prioridad_mueve_la_cola` |
| 65 | 2026-09-11 | `coordinacion_de_tareas` |
| 66 | 2026-09-11 | `notas_internas` |
| 67 | 2026-09-11 | `auditoria_de_las_notas` |
| 68 | 2026-09-11 | `historial_del_restaurante` |
| 69 | 2026-09-11 | `el_motivo_del_estado` |
| 70 | 2026-09-11 | `dar_acceso_a_un_restaurante` |
| 71 | 2026-09-12 | `el_aviso_de_la_reasignacion` |
| 72 | 2026-09-12 | `lo_que_ya_se_hace_no_se_reordena` |
| 73 | 2026-09-12 | `el_coste_de_la_ia_en_milicentimos` |
| 74 | 2026-09-12 | `el_cuarto_caso_de_rn_est_04` |
| 75 | 2026-09-12 | `condiciones_versionadas_y_aceptadas` |
| 76 | 2026-09-12 | `el_aviso_de_las_condiciones_nuevas` |
| 77 | 2026-09-13 | `menu_diario_menus_versiones_y_actualizaciones` |
| 78 | 2026-09-13 | `menu_diario_plantillas_y_descargas` |
| 79 | 2026-09-13 | `menu_diario_equipo_cola_y_correccion` |
| 80 | 2026-09-13 | `calendario_completo_y_presupuestos` |
| 81 | 2026-09-13 | `integraciones_conexiones_y_sincronizacion` |
| 82 | 2026-09-14 | `integraciones_revocacion_remota` |
| 83 | 2026-09-14 | `zona_horaria_del_espacio_para_el_restaurante` |
| 84 | 2026-09-14 | `oportunidades_por_reglas_deterministas` |
| 85 | 2026-09-14 | `informes_generacion_aprobacion_y_envio` |
| 86 | 2026-09-14 | `informes_enviar_pasa_por_el_flujo` |
| 87 | 2026-09-15 | `las_fechas_en_la_zona_del_espacio` |
| 88 | 2026-09-15 | `el_comentario_de_client_can_view_reports` |
| 89 | 2026-09-15 | `plataforma_solicitud_de_espacio` |
| 90 | 2026-09-15 | `suscripcion_de_cuotly` |
| 91 | 2026-09-15 | `panel_modo_soporte_y_2fa` |
| 92 | 2026-09-15 | `onboarding_y_ciclo_de_vida_del_espacio` |
| 93 | 2026-09-15 | `soporte_centro_de_ayuda_y_estado` |
| 94 | 2026-09-15 | `app_movil_y_push` |
| 95 | 2026-09-16 | `pendientes_de_la_fase_4` |
| 96 | 2026-09-16 | `los_cuatro_planes_de_restavor` |
| 97 | 2026-09-16 | `como_se_entra_en_cuotly` |
| 98 | 2026-09-16 | `el_contexto_global` |
| 99 | 2026-09-17 | `piezas_sueltas_del_diseno` |
| 100 | 2026-09-17 | `las_cuatro_del_grupo_c` |
| 101 | 2026-09-17 | `alergenos_del_menu` |
| 102 | 2026-09-19 | `la_nota_de_alergenos` |
| 103 | 2026-09-19 | `almacenamiento_por_restaurante` |
| 104 | 2026-09-19 | `los_seis_canales_de_fabrica` |
| 105 | 2026-09-19 | `crear_el_panel_del_restaurante` |
| 106 | 2026-09-19 | `prioridad_de_la_solicitud` |
| 107 | 2026-09-19 | `los_siete_permisos_del_cliente` |
| 108 | 2026-09-19 | `el_septimo_permiso_consultar_informes` |
| 109 | 2026-09-19 | `la_foto_de_perfil` |
| 110 | 2026-09-19 | `el_plan_manda_tres_cosas_distintas` |
| 111 | 2026-09-20 | `los_cinco_niveles_de_informe` |
| 112 | 2026-09-20 | `lo_que_ha_pasado_este_mes` |
| 113 | 2026-09-20 | `la_ficha_del_cambio_y_la_bolsa` |
| 114 | 2026-09-20 | `invitaciones_al_panel_del_restaurante` |
| 115 | 2026-09-20 | `la_invitacion_en_la_auditoria` |
| 116 | 2026-09-20 | `los_tiempos_de_cada_cambio` |
| 117 | 2026-09-20 | `vigilancia_de_resenas` |
| 118 | 2026-09-20 | `el_plazo_de_realizacion_del_plan` |
| 119 | 2026-09-21 | `responsable_del_restaurante` |
| 120 | 2026-09-21 | `la_foto_del_restaurante` |
| 121 | 2026-09-21 | `la_foto_de_varios_restaurantes` |
| 122 | 2026-09-21 | `al_momento_o_resumen_diario` |
| 123 | 2026-09-21 | `el_barrido_del_resumen_se_encola` |
| 124 | 2026-09-21 | `el_resumen_sale_a_partir_de_las_ocho` |
| 125 | 2026-09-22 | `el_nif_en_la_solicitud_de_acceso` |
| 126 | 2026-09-22 | `el_documento_se_comprueba` |
| 127 | 2026-09-22 | `el_seguimiento_de_la_solicitud` |
| 128 | 2026-09-23 | `la_actividad_del_restaurante` |
| 129 | 2026-09-23 | `reembolso_sin_duplicados` |
| 130 | 2026-09-23 | `los_permisos_del_equipo` |
| 131 | 2026-09-23 | `versiones_de_planes_y_servicios` |
| 132 | 2026-09-23 | `solicitud_en_nombre_del_restaurante` |
| 133 | 2026-09-23 | `en_nombre_del_restaurante_sin_identidad` |
| 134 | 2026-09-23 | `restavor_nace_con_premium_plus_entero` |
| 135 | 2026-09-23 | `grupos_crear_editar_y_mover` |
| 136 | 2026-09-24 | `informes_de_finanzas_con_la_clave_de_servicio` |
| 137 | 2026-09-25 | `el_informe_del_mes_desde_la_ficha` |
| 138 | 2026-09-25 | `el_trabajador_lleva_los_informes_de_su_restaurante` |
| 139 | 2026-09-25 | `retirar_a_alguien_del_equipo` |
| 140 | 2026-09-25 | `cuotly_elimina_cuentas_espacios_y_restaurantes` |
| 141 | 2026-09-26 | `cuotly_avisa_de_lo_que_elimina` |
| 142 | 2026-09-26 | `archivados_recuperar_y_eliminar` |
| 143 | 2026-09-26 | `lo_eliminado_ya_no_se_ve` |
| 144 | 2026-09-26 | `imprimir_el_menu` |
| 145 | 2026-09-26 | `el_informe_trimestral` |
| 146 | 2026-09-26 | `el_basico_a_veinte_euros` |
| 147 | 2026-09-26 | `las_incidencias` |
| 148 | 2026-09-26 | `el_catalogo_de_tres_planes` |
| 149 | 2026-09-27 | `el_motor_de_creditos` |
| 150 | 2026-09-27 | `las_tres_salidas` |
| 151 | 2026-09-27 | `el_detalle_del_consumo` |
| 152 | 2026-09-27 | `menu_diario_dentro_del_plan` |
| 153 | 2026-09-27 | `informes_y_oportunidades` |
| 154 | 2026-09-27 | `el_catalogo_en_creditos` |
| 155 | 2026-09-27 | `la_app_se_llama_restavor_web` |
