# Instrucciones para Claude Code · ampliación Restavor app y Restavor agents

Léelo junto a `CLAUDE.md` del repositorio. En la Fase A (APP-01) copia a `CLAUDE.md` lo que haga falta de aquí, sin quitar nada de lo que ya dice.

## Qué hay en `docs/agents/`
- `PRD-RESTAVOR-AGENTS.md`: qué hay que construir. Es la especificación de esta ampliación.
- `diseno/`: pantallas de referencia (`README.md` explica cuáles son "Final" y cuáles "Estructura") y `capturas/` con las imágenes exportadas de la maqueta.
- `textos-avisos.md`: textos exactos de los avisos a comensales (ES/EN, email, WhatsApp y SMS).
- `guia-conectar-agente.md`: la API vista desde el agente de llamadas. Tiene que coincidir con lo programado.

## Cómo trabajamos
- **Dónde se trabaja:** en la rama `agents` y contra el proyecto de Supabase "Restavor pruebas" (PRD Fase 0). **Nunca** subas a la rama de producción ni apliques migraciones al proyecto de producción sin que Bosco lo pida por escrito en ese momento.
- **Por fases** (PRD §15), una por sesión. Cada fase empieza en **modo plan**: lee las secciones del PRD que aplican y las normas de `CLAUDE.md`, propón el plan (migraciones, funciones RPC, rutas, componentes, tests) y espera la aprobación de Bosco.
- **Bosco no programa.** Explica el plan y los resultados en lenguaje sencillo, sin jerga. Cuando necesites una cuenta, una clave o una decisión, dilo claramente: qué, para qué y dónde se pega.
- Al terminar: la Definición de hecho de §15.0 **completa**, enseñando las pruebas (salida de los comandos y capturas), no solo "hecho". Después, un subagente revisa el diff contra los criterios de la fase y contra `CLAUDE.md`.
- Si el PRD choca con `CLAUDE.md` o con una decisión de `docs/DECISIONES.md`, **para y pregunta**. Las excepciones ya decididas por Bosco son las de PRD §2 (D-A a D-K); escríbelas en `docs/DECISIONES.md` antes de programarlas.
- Nada de lo que ya funciona en Restavor web puede romperse: todas las suites existentes (unitarias, SQL y e2e) tienen que seguir en verde.

## Normas específicas de Restavor agents
- Lógica pura en `src/core/reservations/` y `src/core/agents/`; adaptadores en `src/services/agents/` con versión falsa; textos en `src/i18n/es.ts` (sección `agents`); navegación en `navigation.ts` (`agentsMenu()`, `agentsMobileNav()`).
- Tablas nuevas según PRD §8, con todas las reglas del repositorio (`space_id NOT NULL`, RLS, sin `DELETE`, auditoría, eventos, idempotencia, guardia de soporte en solo lectura, privilegios de columna).
- Reglas nuevas con código `RN-APP-xx`, `RN-AGT-xx`, `RN-RES-xx`, `RN-LLA-xx`, cada una con su test SQL o unitario que la cite.
- **Nunca se borran reservas**: solo cambian de estado, y cada cambio queda en `reservation_events` con quién lo hizo.
- **Datos de comensales:** el equipo del espacio no los ve fuera de una sesión de soporte de Reservas (PRD §3.4). Tests que lo demuestren.
- **Dinero:** céntimos enteros, salvo el saldo y los costes de uso, en millonésimas de euro (D-G). El saldo es un libro inmutable con signo (`agent_balance_entries`). Stripe **solo** para recargas de saldo (D-C).
- **Sin `DELETE`, tampoco para "borrar datos":** anonimizar es un `UPDATE` del sistema; `reservation_events` y `audit_log` nunca guardan datos personales de comensales (PRD §6.13).
- **Los cobros de Reservas no tocan Restavor web** (D-D): `dunning_sweep` los ignora y Reservas tiene su propio barrido y reactivación. Test obligatorio en los dos sentidos.
- **Avisos a comensales, avisos a personas de Restavor agents y tareas frecuentes:** envío directo y `pg_cron` + `pg_net` (PRD §10.6), no la cola de dos veces al día. Las migraciones no programan tareas: eso va en `supabase/operaciones/agents-cron.sql`.
- Teléfonos en E.164; fechas de reserva en la zona del restaurante.
- Accesibilidad AA, zonas táctiles de 44 px, nunca solo color. Sin emojis.
- Variables de entorno nuevas en `.env.example` con una línea que diga para qué son: `ENABLE_FAKE_AGENT`, `ENABLE_DEMO_PLATFORM`, `ENABLE_FAKE_MESSAGING`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, `SMS_SENDER_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `RESERVATIONS_BROADCAST_SECRET`, `AGENTS_PIN_SECRET`, `LEGAL_PRIVACY_URL`, `LEGAL_TERMS_URL`.
