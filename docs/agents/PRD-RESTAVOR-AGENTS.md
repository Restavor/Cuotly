# PRD · Restavor app y Restavor agents › Reservas

Versión 2.0 · 30/09/2026 · Propietario del producto: Bosco (Restavor, info@restavor.com)
Ampliación del repositorio `Restavor/Cuotly` (Restavor web). Sustituye al PRD v1 de la "app de reservas", que era una app aparte.

> **Cómo usar este documento (para Claude Code)**
> - Esto **no es un proyecto nuevo**: se construye dentro del repositorio de Restavor web. Mandan, por este orden, `CLAUDE.md` del repositorio, `docs/PRD.md` y este documento. Si algo de aquí choca con `CLAUDE.md`, **para y pregunta a Bosco**. Las únicas excepciones ya decididas por Bosco están en §2 (D-A a D-K) y hay que escribirlas en `docs/DECISIONES.md` antes de programarlas.
> - Todas las normas del repositorio se aplican a lo nuevo sin excepción: lógica en `src/core/` con tests, adaptadores en `src/services/`, textos en `src/i18n/es.ts`, navegación como datos en `components/shell/navigation.ts`, migraciones nuevas y numeradas (nunca se edita una aplicada), RLS en toda tabla, escritura por funciones RPC `SECURITY DEFINER` que comprueban permisos, **ningún `DELETE`**, auditoría en `audit_log`, estados como eventos, idempotencia en lo crítico, dinero en céntimos (excepción del saldo en D-G), `timestamptz` y cada regla `RN-xxx` con su test (SQL si protege la base de datos, unitario si es lógica de `src/core/`) que la cite.
> - Se construye **por fases** (§15), en la rama `agents` y contra el **entorno de pruebas** (Fase 0). Nada llega a producción hasta que Bosco lo pida. Cada fase empieza en modo plan y termina con su Definición de hecho (§15.0).
> - Referencia visual: `docs/agents/diseno/` (§12). El comportamiento lo manda este documento; el aspecto, el sistema Emerald Control del repositorio (`/styleguide`, `tokens.css`) más los colores propios de §12.2.
> - Códigos nuevos de reglas: `RN-APP-xx` (puerta común), `RN-AGT-xx` (Restavor agents y saldo), `RN-RES-xx` (Reservas), `RN-LLA-xx` (agente de llamadas). Cuando un apartado da un rango ("RN-LLA-07 a RN-LLA-12"), los códigos se asignan en orden a sus puntos y la lista final se guarda en `docs/agents/reglas.md`. Los identificadores de historia (`APP-01`, `RES-03`…) se usan en commits, tests y en el ROADMAP.

---

## 1. Visión

Restavor pasa a ser **una sola plataforma con un solo acceso**:

```
Restavor app  (la puerta común: entrar, inicio, cuenta)
├── Restavor web     el mantenimiento web que ya existe (este repositorio)
└── Restavor agents  agentes de IA para restaurantes
    └── Reservas     el primer agente: agenda de reservas + agente de llamadas
        (Bosco añadirá más agentes después)
```

**Reservas** junta en una sola agenda muy sencilla todas las reservas del restaurante: las del agente de llamadas con IA, las de plataformas (TheFork, CoverManager… por API), las del formulario de su web y las apuntadas a mano. El agente de llamadas coge el teléfono cuando el local no puede, responde dudas con la información que el restaurante le ha dado y apunta, cambia o cancela reservas.

**Principios de Reservas**
1. **Muy sencilla.** Un camarero en pleno servicio la entiende sin formación. Pocos botones, todo a la vista.
2. **Nunca se pierde una reserva.** Nada se borra; todo queda registrado con quién lo hizo.
3. **La app informa, no bloquea sin motivo.** Solo impide lo que rompería el servicio.
4. **Una sola verdad.** Los cambios de una reserva de plataforma intentan reflejarse en los dos sitios.

**Negocio:** Reservas cuesta **48 € + IVA al mes, sin permanencia**, con el agente de llamadas incluido. Las llamadas del agente, los WhatsApp y los SMS se pagan aparte con un **saldo** que el restaurante recarga con tarjeta y que descuenta **lo que cuesta cada uso, sin recargo**. Restavor aprueba cada alta.

---

## 2. Decisiones nuevas (añadir a `docs/DECISIONES.md` con número propio)

| # | Decisión | Qué cambia en el repositorio |
|---|---|---|
| D-A | **Restavor app es la raíz.** `/` pasa a ser el Inicio de Restavor app. El Inicio global actual de Restavor web se mueve a `/web`. | Cambia la decisión 42. `GLOBAL_HOME`, `globalMenu()`, `globalMobileNav()`, `proxy.ts` y las redirecciones tras entrar. |
| D-B | **Restavor agents es un producto de la plataforma** con Reservas como primer agente. El restaurante y las personas son los mismos que en Restavor web (mismo `establishments`, mismas cuentas). Un restaurante solo con Reservas es un `establishment` sin plan de mantenimiento con el servicio Reservas. | `services.kind` admite `reservations`. Navegación y armazón nuevos. |
| D-C | **Stripe solo para recargas de saldo de Restavor agents.** El restaurante paga con tarjeta y el saldo sube solo al confirmarse el pago. Todo lo demás sigue "sin Stripe, pagos registrados a mano". | Excepción escrita a la regla "Sin Stripe" de `CLAUDE.md`. |
| D-D | **El ciclo de vida de Reservas es independiente** del restaurante: impago de Reservas → 7 días de margen → pausa solo de reservas nuevas (la agenda nunca se bloquea). Restavor web mantiene su regla (24 h pausa, 72 h suspensión) y no afecta a Reservas, ni al revés. | Estado propio en `reservation_settings.service_status`. `dunning_sweep`, `set_establishment_nonpayment_status()` y `reactivate_establishment_after_payment()` **ignoran** los cobros de suscripciones al servicio Reservas; Reservas tiene su propio barrido y su propia reactivación (§6.12). Ninguna regla de Reservas lee `establishments.status`. |
| D-E | **Datos de los comensales** (nombres, teléfonos, emails, notas): el equipo de Restavor solo los ve quien esté **marcado como soporte** y abriendo una sesión de soporte de Reservas con motivo, que queda registrada y la ve el restaurante. Abrirla exige el **segundo paso** (sesión `aal2`). | Columna `space_memberships.can_support_reservations`; `platform_roles.can_support` cuenta como marcado. |
| D-F | **Excepción al principio P5** ("la IA propone, una persona valida"): el agente de llamadas **actúa solo** (crea, cambia y cancela reservas, responde dudas) dentro de las reglas de Reservas. Lo decidió Bosco al definir Reservas (el agente apunta directamente; solo los grupos grandes quedan pendientes). La lectura de documentos por IA sí se enseña al restaurante para que la corrija. | Escribir la excepción junto a RN-CRE-09. |
| D-G | **Saldo a precio real**, compartido por todos los agentes de un restaurante. Como un WhatsApp cuesta menos de 2 céntimos, el libro del saldo guarda **millonésimas de euro** (`amount_micros`), igual que `ai_usage` guarda fracciones; en pantalla se enseña al céntimo. | Libro inmutable nuevo `agent_balance_entries`. Excepción escrita a "dinero en céntimos" solo para este libro. |
| D-H | **Sin plan anual.** Solo mensual, sin permanencia: Reservas no crea `plan_commitments` ni `consumption_cycles`. | — |
| D-I | **API y webhooks de Restavor agents.** Se adelanta solo lo necesario para Reservas: la API del agente (§9.1), la del formulario web (§9.2) y los webhooks de entrada (§9.3). La "API pública y webhooks" general de Restavor web sigue aplazada. | Excepción escrita a los aplazados de `CLAUDE.md`. |
| D-J | **Orden de construcción:** Restavor app y Restavor agents van **antes** del bloque legal y fiscal (cambia el orden de la decisión 37). El bloque legal sigue siendo obligatorio antes de dar de alta a restaurantes reales (§17). | `CLAUDE.md`: no parar por el bloque legal al empezar estas fases. |
| D-K | **Reservas en pausa: el agente no coge, pasa las llamadas al local** (antes se pensó que respondiera "ahora no podemos gestionar reservas"). Así no se pierde ninguna llamada. | `routeCall` (§7.6). |

---

## 3. Usuarios, roles y permisos

### 3.1 Quién es quién en Reservas

| Rol en Reservas | Qué es en el repositorio | Cómo entra |
|---|---|---|
| **Propietario** | `local_owner` del restaurante o `global_owner` de su grupo | Su cuenta (correo y contraseña). En la tablet del local, además, su PIN |
| **Encargado** | `editor` del restaurante con el permiso nuevo **`manage_reservations`** | Su cuenta. En la tablet, su PIN |
| **Equipo** | Fila de `reservation_staff` (nombre + PIN), **sin cuenta** | Solo en un dispositivo del local activado, con su PIN |
| **Restavor (equipo del espacio)** | `owner`/`admin` del espacio `restavor` | Ve y cambia la configuración, el estado, las cifras y los errores. **No** ve datos de comensales salvo D-E |
| **Soporte de Reservas** | `space_memberships.can_support_reservations = true` o `platform_roles.can_support` | Sesión de soporte de Reservas (§3.4) |
| **Agente de llamadas** | Clave de API por restaurante | API `/api/agents/v1` |
| **Plataforma** | TheFork, CoverManager… | Conectores y webhooks |
| **Cliente final (comensal)** | Sin cuenta | Formulario web, enlace de cancelación, avisos |

Un `editor` sin `manage_reservations` **no ve Reservas**. El Equipo no ve nada de Restavor web ni sale de la tablet del local.

### 3.2 Permisos

"Restavor" = equipo del espacio `restavor` **fuera** de una sesión de soporte (no ve datos de comensales). "Soporte" = quien está marcado como soporte, **dentro** de una sesión de soporte de Reservas (§3.4).

| Acción | Propietario | Encargado | Equipo (con PIN) | Restavor | Soporte (en sesión) |
|---|---|---|---|---|---|
| Ver agenda, calendario, buscar, fichas | Sí | Sí | Sí (en la tablet) | Solo cifras | Sí |
| Crear, editar, cancelar, confirmar/rechazar grupos, "No vino" | Sí | Sí | Sí | No | Sí |
| Ajustes de horarios, aforo, días cerrados, límites | Sí | Sí | No (Ajustes no aparece) | Sí | Sí |
| Añadir/quitar Equipo, cambiar sus PIN, activar/desactivar dispositivos del local | Sí | Sí | No | Sí | Sí |
| Añadir/quitar Propietarios y Encargados | Sí | No | No | Sí (con las invitaciones del repositorio) | Sí |
| **Encender y apagar el agente**, su horario, teléfono para pasar llamadas | Sí | Sí | No | Sí | Sí |
| **Información del agente** (documentos, web, preguntas, instrucciones) | Sí | Sí | No | Sí | Sí |
| Ver llamadas del agente | Sí | Sí | Sí (sin coste) | Solo cifras | Sí |
| Ver estado de las conexiones | Sí | Sí | No | Sí | Sí |
| Ver saldo y movimientos | Sí | Sí | No | Sí (importe y movimientos) | Sí |
| **Recargar saldo** | Sí | No ("Pide al propietario que recargue") | No | Solo registrar recargas a mano | No |
| Interruptor de WhatsApp/SMS | Sí | Sí | No | Sí | Sí |
| Plan, pagos, darse de baja de Reservas | Sí | No | No | Sí | No |
| Descargar todas las reservas (Excel) | Sí | No | No | No | Sí |
| Conectar plataformas, clave del agente, números de teléfono del agente, "cómo le llegan las llamadas", color y logo del formulario | No | No | No | **Solo Restavor** (con `aal2`) | — |
| Aprobar solicitudes de Reservas, registrar pagos, ajustes de saldo | No | No | No | **Solo Restavor** (ajustes de saldo con `aal2`) | — |
| Avisos al móvil (reserva nueva, pendientes, errores) | Sí | Sí | No (sonido en la tablet) | Solo errores | — |

Toda comprobación pasa por una función de dominio `canReservations(actor, action, resource)` en `src/core/` (y su gemela SQL en las RPC), con tests que recorren esta tabla completa.

**En la tablet sin PIN** (modo dispositivo) no aparecen: Saldo, Plan y pagos, Ajustes (solo con PIN de Propietario o Encargado), la columna de coste de las llamadas ni ningún importe. El menú lo decide `agentsMenu()` según el actor.

### 3.3 Dispositivo del local (tablet con PIN)
- Un Propietario o Encargado activa un dispositivo ("Usar como tablet del local") y le pone nombre. Se guarda un token largo en una cookie `httpOnly`; en base de datos solo su hash (`reservation_devices`).
- Sin PIN se ven Hoy, Calendario, Buscar, fichas y llamadas. **Cada acción** que cambia algo pide "¿Quién eres?" + PIN y se ejecuta con los permisos de esa persona **solo para esa acción**. Ajustes y el botón de encender/apagar el agente solo con PIN de Propietario o Encargado (se cierran al salir o a los 2 minutos sin tocar).
- El PIN tiene **4 cifras**. 5 PIN erróneos → bloqueo de 1 minuto. El PIN es único dentro del restaurante: se guarda como HMAC con una clave del servidor (`AGENTS_PIN_SECRET`), para poder comprobar que no se repite sin guardarlo en claro.
- Al quitar a un Propietario o Encargado del restaurante (o al perder `manage_reservations`), su PIN deja de valer en ese momento.
- La tablet del local **se salta el Inicio de Restavor app** y abre siempre Reservas › Hoy.
- En un dispositivo activado se ignora la sesión personal (para usarla, primero se desactiva el dispositivo). En iPhone se activa desde la app instalada en la pantalla de inicio.
- Un dispositivo no es un usuario de Supabase: sus peticiones pasan por el servidor, que valida el token y, para acciones, el PIN.
- `proxy.ts`: con una cookie de dispositivo válida, **manda el dispositivo** (no se redirige a `/sesion-caducada` ni a `/cuenta/verificar` aunque la sesión personal haya caducado). Las rutas públicas y de máquinas (`/r`, `/widget`, `/reservar.js`, `/c`, `/api/public/*`, `/api/agents/*`) quedan fuera de las comprobaciones de sesión.

### 3.4 Sesión de soporte de Reservas (D-E)
- La abre alguien marcado como soporte, con sesión `aal2` (segundo paso hecho): desde la ficha del restaurante en el espacio Restavor (pestaña Reservas › "Abrir como soporte") o, si es de la plataforma con `can_support`, desde `/administracion`. Motivo obligatorio, caducidad (por defecto 60 minutos).
- Lleva a `/agents/[id]/reservas` con barra fija "Estás viendo Reservas de <restaurante> como Restavor (soporte) · Salir". Las rutas de `/agents` aceptan a este actor mientras la sesión esté abierta; al caducar, vuelve a la ficha del espacio.
- Acciones etiquetadas `restavor_support`, todo en `audit_log` con la sesión. Es **distinta** de `support_sessions` de la plataforma: si la persona tiene además abierta una de plataforma en `read`, la guardia `<tabla>_guard_support_read_only` sigue bloqueando las escrituras (es lo correcto).
- El restaurante ve las sesiones en Ajustes › Historial ("Restavor entró como soporte · motivo · hora"), pero nunca el identificador interno de quién fue (P7): ve "Restavor (soporte)". Las columnas de identidad (`actor_user_id`, `actor_id`) tienen privilegios de columna que el restaurante no puede leer.
- Fuera de una sesión, las pantallas de Restavor muestran cifras y estados, nunca nombres, teléfonos ni notas de comensales (en errores, los contactos van enmascarados: `ju***@gmail.com`).

---

## 4. Restavor app · la puerta común

### 4.1 Rutas y marca
- `/` = **Inicio de Restavor app** (`diseno/final/AppInicio`, `AppInicioSoloWeb`, `AppInicioMovil`). El Inicio global actual de Restavor web pasa a `/web` sin otros cambios.
- La marca: "Restavor" solo en la puerta común; "Restavor **web**" y "Restavor **agents**" en cada producto. `brandSuffix` pasa a ser una variable por producto (`AppShell.tsx`, `components/Logo.tsx`, `es.common`).
- La pantalla de entrar dice "Entrar en Restavor" (el botón ya no dice "Entrar en Restavor web").

### 4.2 Qué productos puede abrir cada persona (RN-APP-01)
Función `my_products()` (`SECURITY DEFINER`, como `my_contexts()`) que devuelve, para la persona que entra:
- **web**: si tiene algún contexto de Restavor web: equipo de un espacio, o panel de un restaurante con plan de mantenimiento o con algún servicio que **no** sea Reservas. Un restaurante que solo tiene Reservas **no** da panel de Restavor web (tampoco en `my_contexts()`).
- **agents**: si es Propietario o Encargado (§3.1) de al menos un restaurante con Reservas en `approved_pending_payment`, `active`, `past_due`, `paused` o `ending`; o si es Propietario de uno en `closed` durante los 30 días de descarga (solo para ir a "Reservas cerrada").
- **agents_offer**: restaurantes de los que es Propietario, que **no** tienen Reservas (ni solicitud pendiente) y cuyo espacio tiene Reservas habilitado (`spaces.reservations_enabled`, §14). Sirve para enseñar "Contratar".
- **agents_requests**: sus solicitudes de Reservas `requested` o `rejected` (para enseñar su estado).

### 4.3 Comportamiento del Inicio (RN-APP-02)
- Se enseña el Inicio (`/`) si la persona tiene **dos productos**, o si tiene uno **y** algo que contratar o una solicitud (`agents_offer` o `agents_requests` no vacíos), o si **no tiene ninguno** (entonces el Inicio enseña "Solicitud enviada · Restavor la está revisando", "No podemos darte acceso a Reservas" con el motivo, o "Aún no tienes nada contratado"; `diseno/final/AppInicioEstados`). Solo se salta si tiene un único producto y nada que contratar (por ejemplo, un trabajador de un espacio o un restaurante solo con Reservas): entonces entra directo en ese producto.
- Con dos productos: "Necesita tu atención" arriba, mezclando avisos de los dos (grupos pendientes de Reservas, saldo bajo, pago de Reservas pendiente, más lo que ya enseña Restavor web), y una tarjeta por producto con su resumen y "Entrar".
  - Tarjeta Restavor web: lo que hoy enseña el Inicio global (plan, consumo, solicitudes).
  - Tarjeta Restavor agents: por restaurante, reservas de hoy y personas, grupos pendientes, llamadas atendidas hoy, estado del agente (encendido/apagado) y saldo.
- Propietario solo con Restavor web: la tarjeta de Restavor agents aparece "Sin contratar" con **Contratar Reservas** (§4.4, `diseno/final/AppInicioSoloWeb`). Con una solicitud enviada: "Solicitud enviada · Restavor la está revisando".
- **Cambiar de producto** (`diseno/final/AppCambiarProducto`): arriba del menú lateral de **los dos** productos, el logo abre un pequeño menú: "Inicio de Restavor", "Restavor web", "Restavor agents" (lo no contratado sale como "Contratar"; lo que no puede usar, no sale). En Restavor agents se ve además "Volver al inicio de Restavor" (como en la maqueta).
- Un restaurante con Reservas **y** varias personas: cada persona ve solo lo que su rol le deja.

### 4.4 Contratar Reservas (RN-APP-03)
- Ventana `diseno/final/AppContratar`: restaurante (si tiene varios), qué incluye, cuota 48 € + IVA/mes (58,08 € con IVA, sin permanencia), saldo aparte, los tres pasos y aceptar las condiciones de Reservas.
- "Enviar solicitud" crea `reservation_service_requests` (`requested`) guardando la aceptación (versión de las condiciones del servicio, quién y cuándo), un email al restaurante "Hemos recibido tu solicitud" y un aviso al equipo Restavor. No crea nada más. (`terms_acceptances` necesita una suscripción, así que se escribe al aprobar.)
- **Quien no tiene cuenta** pide acceso por la puerta que ya existe (`/signup`), con una casilla nueva "¿Qué te interesa? Mantenimiento web / Reservas / Las dos" que se guarda en la solicitud. Después, en este orden:
  1. La plataforma aprueba la cuenta como hoy.
  2. El equipo del espacio `restavor` crea el grupo y el restaurante (herramientas que ya existen) y da a la persona el rol `local_owner`.
  3. Desde "Reservas › Solicitudes" del espacio, "Crear solicitud para este restaurante" (RPC `create_reservation_request_on_behalf`), sin aceptación todavía.
  4. Al aprobarla, la primera vez que el Propietario entra en Restavor agents ve "Acepta las condiciones de Reservas" antes que los datos de pago (canal `in_app`).
- **Aprobar o rechazar** (con motivo) desde el espacio (§11.2), solo con la RPC `approve_reservation_request` / `reject_reservation_request`. Aprobar crea, en una transacción: la suscripción `subscriptions(kind='service')` al servicio Reservas, `terms_acceptances` (si ya aceptó), `reservation_settings` en `approved_pending_payment`, el primer cobro con el motor de cobros existente y el email "Aprobado: datos para pagar" (IBAN, Bizum, importe, concepto). Ninguna otra pantalla ni RPC puede crear una suscripción al servicio Reservas (un disparador lo impide), así que no se contrata desde "Plan y servicios" de Restavor web. Reservas **nunca** crea `plan_commitments` ni `consumption_cycles`.
- **Periodo:** como en el resto del repositorio, la suscripción empieza el día de la aprobación y el primer cobro cubre el mes desde ese día (`period_start` = día de la aprobación). Los siguientes los emite el motor existente cada mes desde esa fecha. Reservas se puede usar desde que se registra el pago del primer cobro (`activated_at`).
- Al registrarse el pago del primer cobro → `active`, email "Ya puedes usar Reservas" y aparece Primer uso (§11.1).

---

## 5. Restavor agents · armazón y saldo

### 5.1 Armazón y navegación
- Rutas bajo `/agents` (§11.1). Si la persona tiene un solo restaurante con Reservas, `/agents` lleva directo a su Hoy; si tiene varios, selector (el mismo patrón que el selector de restaurante de Restavor web). Según el estado: `approved_pending_payment` → pantalla "Aprobado: datos para pagar" (y antes, si falta, aceptar condiciones); `closed` → "Reservas cerrada"; `active` sin Primer uso terminado → Primer uso.
- Menú lateral (datos en `navigation.ts`: `agentsMenu()`, `agentsMobileNav()`, con icono y ruta en cada destino, y el rol nuevo clasificado en `ShellRole`):
  - Logo "Restavor agents", ficha del restaurante, "Volver al inicio de Restavor".
  - Sección **Reservas**: Hoy · Calendario · Agente de llamadas · Ajustes.
  - Abajo, lo común a todos los agentes: **Saldo** (con el importe) · Plan y pagos · Ayuda.
- Móvil: barra inferior Hoy · Calendario · (+) Nueva · Agente · Más (`diseno/final/AgentsHoyMovil`, `AgentsMasMovil`).
- Siempre iconos + nombre de cada sección (también en tablet).

### 5.2 Saldo (RN-AGT-01 a RN-AGT-09)
- **RN-AGT-01** Un saldo **por restaurante**, compartido por todos sus agentes. Es la suma de `agent_balance_entries` (libro inmutable con signo, en millonésimas de euro, D-G). Nunca se edita un apunte: una corrección es otro apunte. En pantalla se enseña redondeado al céntimo.
- **RN-AGT-02** Tipos de apunte: `topup` (+), `call` (−), `whatsapp` (−), `sms` (−), `refund` (+, devolución de un cargo), `adjustment` (±, solo Restavor con motivo y `aal2`), `payout` (−, devolución del saldo al darse de baja, a mano).
- **RN-AGT-03 A precio real (D-G):** cada uso descuenta exactamente lo que cobra el proveedor, sin margen y sin redondear (por eso las millonésimas).
  - **Llamadas:** el coste que informa la plataforma del agente al terminar la llamada (minutos del agente + IA + línea de teléfono), en su moneda. Se convierte a euros con el cambio del último día publicado por el Banco Central Europeo (tarea diaria que guarda `fx_rates`). Se guardan importe original, moneda, cambio aplicado e importe en euros.
  - **WhatsApp:** el precio de Meta por mensaje de utilidad en España, en una tabla `messaging_rates` que mantiene Restavor (Meta no devuelve el precio en cada mensaje). Si Meta lo marca como no cobrado (por ejemplo, dentro de una ventana gratuita), se devuelve con un apunte `refund`.
  - **SMS:** el precio que devuelve el proveedor en el aviso de entrega; hasta que llega, se descuenta el precio de `messaging_rates` y luego se corrige con otro apunte (`sms` o `refund` por la diferencia).
- **RN-AGT-04 Recargar (D-C):** solo el Propietario. Importes 10, 20, 50 € u otro (mínimo 10 €), más el IVA del espacio `restavor` (`spaces.tax_rate_percent`, hoy 21 %). Stripe Checkout con tarjeta. Al confirmarse el pago (webhook `checkout.session.completed`), un apunte `topup` **por el importe sin IVA** (el IVA no es saldo), idempotente por sesión de Stripe, aviso en la app y recibo por email. El saldo sube en cuanto llega la confirmación. `checkout.session.expired` → recarga `expired` (sin apunte). Si la tarjeta se rechaza, Stripe lo dice en su propia página y la recarga sigue `created` hasta que se paga o caduca. Sin Stripe configurado, el botón no aparece y Restavor puede registrar recargas a mano (transferencia/Bizum) con el mismo apunte.
- La app **no emite facturas** (bloque legal pendiente). La recarga genera un **recibo** por email; la factura oficial se adjuntará cuando exista el bloque legal y el agente de facturas.
- **RN-AGT-05 Saldo bajo:** aviso a Propietario y Encargado cuando baja de **5 €** (configurable por Restavor), una vez por cruce.
- **RN-AGT-06 Saldo a 0 o menos:** el agente no coge llamadas (se pasan al teléfono para pasar llamadas, §7.3); los WhatsApp/SMS no se envían (los emails sí); barra "Te has quedado sin saldo · Recargar".
- **RN-AGT-07** Un WhatsApp o SMS solo sale si el saldo es **igual o mayor que su precio** en `messaging_rates`, así que los avisos nunca dejan el saldo negativo (salvo la corrección de precio de un SMS, que es de céntimos). Una llamada en curso que agota el saldo se termina y puede dejarlo en negativo como mucho por el coste de esa llamada; se descuenta de la siguiente recarga.
- **RN-AGT-08 Baja de Reservas:** el saldo no gastado se enseña; Restavor lo devuelve a mano si lo piden (apunte `payout`).
- **RN-AGT-09** "Unos N minutos de llamadas" = saldo ÷ coste medio del minuto de ese restaurante en los últimos 30 días (sin llamadas todavía: no se enseña).
- Pantallas: `diseno/final/AgentsSaldo` (tablet) y `diseno/estructura/AgenteSaldoMovil` (móvil, contenido): saldo, "unos N minutos de llamadas", recargar, gasto del mes por agente y tipo, últimos movimientos, descargar en Excel.

---

## 6. Reservas · reglas de negocio

Todas estas reglas viven en `src/core/reservations/` como funciones puras con tests. Los ejemplos numéricos son casos de test obligatorios. Las comprobaciones que protegen la base de datos se repiten en SQL con su suite.

### 6.1 Orígenes y estados
| Origen | Etiqueta | Color texto / fondo | Icono |
|---|---|---|---|
| `agent` | Agente | `#5B4B9A` / `#ECE8F6` | auricular |
| `platform` | Nombre de la plataforma (TheFork…) | `#2F6690` / `#E3EEF6` | globo |
| `web` | Web | `#9A3469` / `#F8E6EF` | ventana |
| `manual` | Manual | `#3F4A5A` / `#E9ECF1` | lápiz |

Siempre color + icono + texto.

| Estado | Cuándo | Cómo se ve |
|---|---|---|
| `pending` | Grupo grande llegado del agente o de la web | Fila amarilla, "Pendiente", Confirmar / Rechazar |
| `confirmed` | Estado normal | Fila normal |
| `cancelled` | Cancelada por quien sea | Tachada, gris, "Cancelada por X · hora" |
| `no_show` | Marcada a mano cuando no aparece | Gris con etiqueta oscura "No vino" |

Transiciones: `pending → confirmed` (Confirmar) · `pending → cancelled` (Rechazar, motivo `rejected`) · `confirmed → cancelled` · `confirmed → no_show` (solo si ya pasó la hora) · `no_show → confirmed` (Deshacer, solo el mismo día) · `confirmed → pending` solo cuando **el agente** sube las personas al umbral de grupo grande o más. Cualquier otra: error.

Marcas: **Nueva** (`is_new`: reservas de agente, web o plataforma; se quita al abrir la ficha) · **Posible duplicada** (§6.7) · **Aforo superado** en la cabecera del turno.

### 6.2 Turnos y huecos (RN-RES-01)
- El restaurante define turnos (nombre, **días de la semana en que funciona**, apertura, cierre, última hora de reserva, aforo), el intervalo de huecos (15 o 30 min) y días cerrados especiales (fecha + motivo). Ejemplo: Comida martes a domingo, Cena martes a sábado.
- Un día está abierto si tiene al menos un turno activo ese día. "Días que abrís" en Ajustes es un atajo que marca o desmarca ese día en todos los turnos.
- Validaciones: apertura < última reserva ≤ cierre; sin cruzar medianoche; dos turnos del mismo día no se solapan en horas de reserva.
- No se puede quitar un turno, ni quitarle un día, ni marcar un día cerrado si hay reservas futuras activas afectadas: la app dice cuántas son y pide moverlas o cancelarlas antes.
- Huecos: desde la apertura hasta la última reserva, ambos incluidos, cada intervalo. Ejemplo: Cena 20:00–23:30, última 22:30, cada 30 → 20:00, 20:30, 21:00, 21:30, 22:00, 22:30.
- Día cerrado → sin huecos. Una hora que no es un hueco (21:15 con huecos cada 30) → `available: false`, motivo `not_a_slot`, con alternativas.
- Las tandas se crean como turnos distintos ("Cena 1ª tanda", "Cena 2ª tanda").

### 6.3 Aforo (RN-RES-02)
- Ocupación(turno, día) = Σ personas de las reservas `pending` + `confirmed`. Plazas libres = aforo − ocupación (puede ser negativa).
- Según el origen: `agent` y `web` → si no caben, `full` con alternativas; `platform` → entra siempre y el turno muestra "Aforo superado"; `manual` → aviso "Te pasas del aforo en N personas. La cena quedaría en X de Y. ¿Guardar igualmente?" (`force = true`).
- Barra de aforo: verde; ≥ 85 % mostaza (`#B7791F`); > 100 % rojo (`danger`) con "Aforo superado".
- Reserva de plataforma fuera de todo turno o en día cerrado: entra con `shift_id` vacío en un bloque "Fuera de turno" con aviso.
- Tests: aforo 60, ocupación 57, manual de 6 → "te pasas en 3"; la misma desde el agente → `full`; desde plataforma → se guarda y el turno queda 63/60.
- **Garantía contra reservas simultáneas:** crear, cambiar fecha/hora/personas y confirmar un grupo se hace con la RPC `book_reservation`, que bloquea restaurante + fecha + turno con `pg_advisory_xact_lock` (los dos turnos si cambia de turno), recalcula la ocupación sin la propia reserva y aplica la regla del origen. Test obligatorio: dos creaciones a la vez desde el agente para las últimas plazas → solo una entra.

### 6.4 Antelación (RN-RES-03, solo agente y web)
- Configurable: mínimo (por defecto 120 min) y máximo (por defecto 60 días). Antes del mínimo → `too_soon`; después del máximo → `too_far`.
- Las manuales no tienen límite de antelación pero no se crean en fechas pasadas (sí se editan).
- Con Reservas en baja (`ending`), no se aceptan reservas nuevas (salvo plataformas) para fechas posteriores al final del periodo pagado (`too_far`).

### 6.5 Disponibilidad y alternativas (RN-RES-04)
`getAvailability(establishment, date, partySize, requestedTime?, source)` devuelve:
- `slots`: todas las horas del día con `available`, `reason` si no (`full`, `too_soon`, `too_far`, `closed_day`, `not_a_slot`, `service_paused`) y `requires_confirmation` (personas ≥ umbral de grupo grande).
- `requested`: resultado para la hora pedida, con `message`: frase lista para decir al cliente ("El domingo a las 21:00 no nos queda sitio para 4 personas.").
- `alternatives` (hasta 3, si la pedida no está disponible): primero huecos del **mismo día** a 120 min o menos (los más cercanos; en empate, el más temprano; en orden cronológico); si no hay, la **misma hora** en los siguientes días abiertos (buscando 14 días como mucho).
- `restaurant`: nombre, teléfono del local, teléfono para pasar llamadas.
- Tests: (a) Cena única llena el domingo, pedida 21:00 para 4 → misma hora martes, miércoles y jueves (lunes cerrado). (b) "Cena 1ª tanda" 20:00–21:30 (última 21:00) llena y "Cena 2ª tanda" 22:00–23:30 (última 23:00) libre, pedida 21:00 → 22:00, 22:30, 23:00. (c) Día cerrado → todo `closed_day` y alternativas en días siguientes. (d) Reservas en pausa → todo `service_paused`, sin alternativas. (e) Hoy a las 14:10 con mínimo 2 h → la comida de hoy `too_soon` y la cena disponible.

### 6.6 Grupos grandes (RN-RES-05)
- Umbral configurable (por defecto: pendiente a partir de 9). Agente o web con personas ≥ umbral → `pending` (cuenta para el aforo). Manual y plataforma → `confirmed`.
- Pendiente sin respuesta: barra fija en Hoy ("N grupos pendientes · Revisar") y en el Inicio de Restavor app; a las 2 h, un aviso más a Propietarios y Encargados. **Nunca caduca sola.**
- Confirmar → `confirmed` + aviso "grupo aceptado". Rechazar → `cancelled` (`rejected`) + aviso "grupo rechazado".

### 6.7 Posibles duplicadas (RN-RES-06)
- Dos reservas activas del mismo restaurante, **mismo día** y **mismo teléfono** normalizado forman un par, salvo que esté en `reservation_duplicate_dismissals`.
- `duplicate_flag` se **recalcula** al crear, editar o cancelar cualquiera de ellas. Al cancelar una del par, la otra vuelve a `none` (si no tiene otro par).
- En la lista: fondo amarillo, "Posible duplicada", "No es duplicada" (guarda el par) y "Cancelar una". La app nunca une ni cancela sola.

### 6.8 Editar (RN-RES-07)
- Se puede cambiar fecha, hora, personas, nombre, teléfono, idioma de avisos y nota.
- Cambiar fecha, hora o personas vuelve a aplicar §6.2–6.7 con las reglas de **quien hace el cambio**: restaurante (o soporte) → `manual`; agente → `agent`; plataforma → entra siempre.
- Si el agente sube una confirmada al umbral o más → `pending` (aviso "solicitud recibida"). Bajar una pendiente por debajo del umbral **no** la confirma sola.
- Plataforma: si el conector permite modificar → se envía; si falla → no se guarda y se muestra el error. Si no lo permite → fecha, hora y personas bloqueadas con "<Plataforma> no deja cambiar la fecha, la hora ni las personas desde aquí. Cámbialas en <Plataforma> y el cambio llegará solo." Nombre, teléfono y nota solo en la app.
- Si el cliente tiene canal de aviso y cambia fecha/hora/personas → aviso "reserva modificada".

### 6.9 Cancelar (RN-RES-08)
- Desde la ficha: motivo opcional (`customer`, `error`, `other`).
- Plataforma: si el conector permite cancelar → también allí. Si no o falla → se cancela en la app, error registrado y aviso persistente "Cancélala también en <Plataforma>" hasta "Hecho". La sincronización **nunca** reactiva una reserva cancelada en la app.
- Aviso "reserva cancelada" al cliente si tiene canal (no para plataformas).
- El cliente cancela desde su enlace hasta `hora − plazo` (por defecto 120 min, configurable). Pasado el plazo: "Ya no se puede cancelar desde aquí. Llama a <restaurante>: <teléfono>". Motivo `customer_link`.

### 6.10 No vino (RN-RES-09)
- Solo cuando ya pasó la hora. Se deshace el mismo día.
- La ficha muestra "Ha venido N veces · ha fallado M veces" por teléfono en ese restaurante (últimos 24 meses).

### 6.11 Avisos al cliente (RN-RES-10)
- Plantillas: `confirmed`, `pending_received`, `group_confirmed`, `group_rejected`, `modified`, `cancelled`. **Mandan los textos de `docs/agents/textos-avisos.md`.** Todas con enlace de cancelar salvo `group_rejected` y `cancelled`.
- **Nunca** para reservas de plataforma.
- Canal: si hay email → solo email. Si no hay email, hay teléfono **y** `whatsapp_consent` → WhatsApp; si Meta dice que el número no puede recibir WhatsApp → SMS. Nunca dos canales. Sin email y sin consentimiento → no sale (`no_consent`). En manuales el consentimiento viene marcado (el personal informa).
- WhatsApp/SMS solo con el interruptor activado y **saldo igual o mayor que el precio del mensaje** (RN-AGT-07); si no, no sale y queda en el historial ("Aviso no enviado: sin saldo").
- SMS sin tildes ni eñes (se transliteran), un solo mensaje de 160 caracteres como máximo.
- Idioma: el de la reserva (`es`/`en`).
- **Se envían al momento**, no con la cola de dos veces al día de Restavor web: envío directo al guardar + reintentos (máximo 3) con una tarea cada minuto (§10). Todo en `reservation_notifications` y en el historial de la reserva.
- Enlace estable `/c/[token]` (128 bits, índice único).
- Respuestas al WhatsApp de Restavor → respuesta automática "Este número solo envía avisos y no lee mensajes. Para cualquier cosa, llama a <restaurante>: <teléfono>."
- Emails: remitente "<Restaurante> <reservas@restavor.com>", `Reply-To` = email del restaurante; pie "Reservas con Restavor".

### 6.12 Ciclo de vida de Reservas (RN-RES-11, D-D)
La solicitud tiene su propio estado (`reservation_service_requests.status`: `requested`, `approved`, `rejected`). `reservation_settings` se crea al aprobar, así que `service_status` empieza en `approved_pending_payment`.

| Estado (`service_status`) | Qué pasa | Email (y aviso en la campana) |
|---|---|---|
| *(solicitud `requested`)* | Nada todavía | Al restaurante: "Hemos recibido tu solicitud". Al equipo Restavor: "Nueva solicitud de <restaurante>" |
| *(solicitud `rejected`)* | No puede entrar en Reservas | "No podemos darte acceso a Reservas" + motivo |
| `approved_pending_payment` | Pantalla "Aprobado: datos para pagar" (cobro, IBAN, Bizum, importe, concepto). Restavor configura agente y plataformas | "Aprobado: datos para pagar" |
| `active` | Todo | Al activarse: "Ya puedes usar Reservas". 5 días antes de cada vencimiento, solo Propietarios: "Tu plan de Reservas vence el <fecha>" + datos de pago |
| `past_due` | Todo + barra "Pago pendiente, quedan N días" (solo Propietario) | El día del vencimiento y 2 días antes de acabar el margen |
| `paused` | Se ve todo. **No** se crean reservas ni se cambia fecha/hora/personas (app, agente ni web). **Sí** se cancela, confirma o rechaza pendientes, "No vino" y notas. El agente no coge llamadas: se pasan al local (D-K). La web muestra el teléfono. `/c/[token]` funciona. Las plataformas siguen entrando. Los avisos de reservas existentes siguen saliendo | "Reservas está en pausa. Paga y se reactiva al momento" |
| `ending` | Funciona hasta el final del periodo pagado (el agente coge llamadas) | "Baja confirmada. Descarga tus datos antes del <fecha>" |
| `closed` | Solo el Propietario entra, a "Reservas cerrada", para descargar sus reservas en Excel durante 30 días; luego se borran los datos personales (§6.13) | 7 días antes del borrado: "Recordatorio: descarga tus reservas antes del <fecha>" |

**Transiciones (solo por RPC o por el barrido de Reservas; cada una en `reservation_service_events`):**
| De → a | Quién o qué | Condición |
|---|---|---|
| — → `approved_pending_payment` | Restavor (`approve_reservation_request`) | Solicitud `requested` |
| `approved_pending_payment` → `active` | Registrar el pago del primer cobro | Pago completo |
| `active` → `past_due` | Barrido diario de Reservas | Algún cobro de Reservas `overdue` (`charge_status()`) |
| `past_due` → `paused` | Barrido diario | Pasan `grace_days` (7) desde el vencimiento más antiguo sin pagar |
| `past_due`/`paused` → `active` | Registrar un pago (gancho en `register_payment()` → `reservations_after_payment()`) | **No queda ningún cobro de Reservas vencido sin pagar del todo**. Con pago parcial sigue igual y Restavor ve "Con este pago todavía debe N cobros" |
| `active`/`past_due`/`paused` → `ending` | Propietario ("Darme de baja") o Restavor | La deuda se mantiene; darse de baja no la borra |
| `ending` → `active` | Propietario ("Anular la baja") | Antes de que acabe el periodo pagado |
| `ending` → `closed` | Barrido diario | Acaba el periodo pagado |
| `paused` → `closed` | Restavor ("Cerrar Reservas", con motivo) | Cuando Restavor lo decide; la deuda se mantiene |
| `closed` → `approved_pending_payment` | Restavor ("Reactivar") | Solo durante los 30 días antes del borrado: emite un cobro nuevo; al pagarlo vuelve a `active` **con todos sus datos** |
| `closed` → (datos borrados) | Barrido diario | 30 días después; `data_purged_at` |

- Registrar un pago en `past_due` o `paused` reactiva al momento (tabla de arriba). En `ending` y `closed`, pagar deuda antigua la salda pero no cambia el estado: para seguir, "Anular la baja" o "Reactivar". Después del borrado, para volver hace falta una solicitud nueva.
- Al pasar a `closed`, la suscripción pasa a `cancelled` con las funciones que ya existen.
- La pausa no termina sola: Restavor cierra a mano cuando decide.
- **No afecta a Restavor web** (ni al revés, D-D): los cobros de Reservas no los tocan `dunning_sweep` ni `run_charge_reminders` (sus recordatorios los manda el barrido de Reservas con sus propios textos, así no llegan dos) y el estado del `establishment` no cambia por Reservas.

### 6.13 Datos personales (RN-RES-12)
- "Borrar datos personales" significa **anonimizar con un `UPDATE` del sistema**, nunca `DELETE`: `customer_name` = "Anónimo" y teléfono, email y nota a nulo; se conservan fecha, hora, personas, origen y estado; `anonymized_at`.
- Para que sea posible sin romper "solo inserción": `reservation_events.data` y `audit_log` **no guardan nunca datos personales de comensales**, solo identificadores y qué cambió ("cambió la hora de 21:00 a 21:30", "cambió el teléfono", sin el número). Los datos personales solo viven en `reservations`, `reservation_notifications.recipient` y `agent_calls` (número y resumen), que se anonimizan.
- Reservas de más de 24 meses (configurable; plazo a confirmar con el abogado): se anonimizan con sus avisos. Llamadas de más de 24 meses: número y resumen a nulo. Tarea diaria.
- Reservas `closed`: a los 30 días se anonimizan todas sus reservas, avisos y llamadas, y los nombres del Equipo. Se conservan `reservation_monthly_stats` y el libro del saldo.
- El Propietario descarga todas sus reservas en Excel cuando quiera.

### 6.14 Sin conexión y tiempo real (RN-RES-13)
- La app se instala como PWA. Se guardan la interfaz y los datos de Hoy y los próximos 7 días. Sin conexión: se ve lo último cargado con "Sin conexión · datos de las HH:MM"; crear, editar, cancelar, confirmar, "No vino" y encender/apagar el agente, desactivados. Nunca se guardan cambios sin conexión. Al volver la conexión, se recarga sola.
- Tiempo real: canal **Broadcast** de Supabase por restaurante con nombre secreto (derivado de una clave del servidor, entregado solo a sesiones y dispositivos autorizados) que solo avisa "hay cambios en la fecha X" o "cambió el estado del agente", sin datos personales; la pantalla vuelve a pedir los datos al servidor.
- Reserva nueva de agente, web o plataforma → barra con sonido corto en los dispositivos abiertos + aviso en la campana y notificación push web a Propietarios y Encargados que la activen.

---

## 7. El agente de llamadas

El agente es de Restavor y se programa fuera de esta app (hoy n8n + ElevenLabs; mañana uno propio). **Bosco lo conectará al final.** Esta app le da información y órdenes por la API (§9.1), recibe el registro de cada llamada y descuenta su coste. Todo lo de esta sección se construye y se prueba con un **agente falso** (§10.1) hasta que Bosco conecte el real.

### 7.1 Encender y apagar (RN-LLA-01 a RN-LLA-04)
- Arriba de "Agente de llamadas", tarjeta grande de estado (`diseno/final/AgentsAgente`, `AgentsEncenderApagar`, `AgentsAgenteMovil`):
  - **Encendido** (verde): "Agente encendido", resumen (cómo le llegan las llamadas, horario, llamadas y reservas de hoy) y botón **Apagar agente**.
  - **Apagado** (gris): "Agente apagado hasta las HH:MM" / "hasta que lo enciendas", "Las llamadas suenan en el local (teléfono)", quién lo apagó y a qué hora, y botón **Encender agente**.
- Al pulsar Apagar, ventana "¿Hasta cuándo lo apagas?": **Durante 1 hora** · **Hasta que acabe este turno** (hora de cierre del turno en curso; si no hay turno en curso, se oculta) · **Hasta que lo vuelva a encender**. Las dos primeras se encienden solas al llegar la hora.
- Lo usan Propietario y Encargado (en la tablet, con su PIN). Cada cambio queda en `agent_state_events` (quién, cuándo, hasta cuándo) y en `audit_log`.
- Apagado a mano no atiende aunque esté dentro de su horario. **Encender lo devuelve a su horario normal** (§7.2).
- Acceso rápido: en la cabecera de Hoy (tablet) un indicador "Agente encendido" / "Agente apagado · hasta HH:MM" que lleva a esta tarjeta.
- El estado se ve en el Inicio de Restavor app y cambia en tiempo real en todos los dispositivos (Broadcast, §6.14).

### 7.2 Horario (RN-LLA-05)
- "Cuándo atiende": **Todo el día** (por defecto; también con el local cerrado, así puede apuntar reservas para otro día) o **En estas horas** (franjas con hora de inicio, fin y días de la semana; se pueden añadir varias). Fuera de horario, las llamadas pasan al local.
- Informativo: "Cómo le llegan las llamadas" (por ejemplo, "el teléfono del local 954 000 000 pasa al agente las llamadas que no cogéis en 4 tonos"). Lo configura Restavor con la compañía de teléfono y lo escribe en la ficha del restaurante; el restaurante solo lo ve.

### 7.3 Teléfono para pasar llamadas (RN-LLA-06)
- En la pestaña Horario. Es a donde el agente pasa la llamada cuando el cliente pide hablar con alguien ("pulse 1"), fuera de horario, con el agente apagado, con Reservas en pausa o sin saldo.
- **Tiene que ser distinto del teléfono del local que se desvía al agente**: la app no deja guardar el mismo número (si no, la llamada daría vueltas).

### 7.4 Información del agente (RN-LLA-07 a RN-LLA-12)
Pestaña **Información** (`diseno/final/AgentsInfo`, `AgentsInfoMovil`). Es todo lo que el agente sabe del restaurante:
1. **Documentos**: carta, alérgenos, menús de grupos, normas… en PDF, Word (.docx) o foto (JPG/PNG/HEIC; en el móvil, "Hacer foto"). Máximo 20 MB por archivo y 30 documentos. Se guardan en el bucket privado `files` del repositorio (categoría nueva `agent_knowledge`).
   - Al subir: estado **Leyendo…** → se extrae el texto (PDF/Word con extracción de texto; fotos y PDF escaneados con lectura por IA usando el SDK de Anthropic que ya usa el repositorio, coste en `ai_usage` generalizado) → **Lo conoce**. Si falla: **No se ha podido leer** con "Probar otra vez".
   - En cada documento, "Ver lo que ha entendido" enseña el texto extraído y deja **corregirlo** (el texto corregido es el que usa el agente). Opciones: Sustituir, Quitar (se archiva, no se borra).
2. **Tu web**: interruptor "El agente consulta tu web" y la dirección (por defecto `establishments.website_url`). Se lee una vez al día (página principal y hasta 10 páginas enlazadas del mismo dominio) y se guarda el texto. Si la web la mantiene Restavor web, además se vuelve a leer cuando se publica un trabajo en ella.
3. **Preguntas frecuentes**: pregunta + respuesta exacta. Añadir, editar, quitar (`diseno/estructura/AgenteEditarRespuesta`).
4. **Instrucciones para el agente**: texto libre (máximo 2.000 caracteres) con cómo actuar en casos concretos.
5. **Lo que ya sabe sin que lo escribas** (solo lectura, sale de Reservas y del restaurante): horario por turnos y días cerrados, dirección, teléfono, umbral de grupos, antelación mínima y máxima, plazo de cancelación. Enlace "Cambiar en Ajustes".
- **Ficha de conocimiento:** la app compila todo lo anterior en un texto ordenado por apartados (`agent_knowledge_snapshots`, con versión y fecha). Se recompila al cambiar cualquier parte (en menos de 5 minutos) y se entrega al agente por la API (§9.1) y, si hay conector, se envía a la plataforma del agente (§10.1). En la pantalla: "Actualizado hoy a las HH:MM".
- Si le preguntan algo que no está, el agente dice que no lo sabe y ofrece pasar la llamada (esto va en las instrucciones fijas que entrega la app, no lo escribe el restaurante).

### 7.5 Llamadas (RN-LLA-13 a RN-LLA-16)
- Cada llamada se registra en `agent_calls`: inicio, fin, duración, número (E.164), resultado, resumen de **dos líneas** (lo genera la plataforma del agente), coste (original, moneda, cambio, euros), reserva relacionada si la hay, y si se pasó al local. **No se guarda ni grabación ni transcripción** (decisión de Bosco).
- Resultados: `booked` (Reserva hecha), `group_pending` (Grupo pendiente), `modified` (Cambio), `cancelled` (Cancelación), `question` (Duda), `transferred` (Pasada al local por el agente, "pulse 1"), `forwarded` (No la cogió: agente apagado, fuera de horario, sin saldo o Reservas en pausa), `hung_up` (Colgó), `other`.
- **Las llamadas que no coge también se registran:** `GET /agent/route` con `call_id` crea la fila con `outcome = forwarded` y `forward_reason`. Si luego llega `POST /calls` con el mismo `call_id`, completa esa fila (no crea otra).
- Las reservas creadas en una llamada guardan el `call_id` de la plataforma (`agent_external_call_id`); cuando llega `POST /calls`, se enlazan con la fila de `agent_calls`.
- Pantalla Llamadas (`diseno/final/AgentsAgente`): por día con flechas, filtros (Todas, Reservas y cambios, Dudas, Pasadas al local; este último incluye `transferred` y `forwarded`), columnas hora, número, duración, qué pasó, coste (no en la tablet sin PIN), resultado y "Ver reserva".
- Cada llamada terminada descuenta su coste del saldo (apunte `call`), idempotente por identificador de llamada de la plataforma.
- Resumen de hoy (llamadas, reservas nuevas, minutos, gasto) en la tarjeta de estado y en el Inicio de Restavor app.

### 7.6 ¿Coge o pasa la llamada? (RN-LLA-17)
Función pura `routeCall(now, state)` → `answer` o `forward` (+ número y motivo). **Coge** solo si Reservas está en `active`, `past_due` o `ending`, el agente no está apagado a mano, está dentro de su horario y el saldo es mayor que 0. Si no, **pasa al local**. Motivos, en este orden de prioridad: `service_paused` (cualquier otro estado de Reservas), `manual_off`, `outside_hours`, `no_balance`. Tests con cada caso y sus combinaciones (incluido `ending`, que coge).

---

## 8. Modelo de datos

Nombres en inglés. Toda tabla nueva lleva `space_id NOT NULL` (el del restaurante) y `establishment_id NOT NULL` salvo que se indique, `id uuid`, `created_at timestamptz`, RLS con políticas explícitas, **ninguna política `DELETE`**, disparador `<tabla>_guard_support_read_only` (o su justificación en la suite 42) y privilegios de columna donde haya identidad del equipo. Estados como `text` con `CHECK`, siguiendo el estilo del repositorio. Dinero en céntimos, salvo el saldo y los costes de uso, en millonésimas de euro (D-G).

### 8.1 Cambios en tablas existentes
- `services.kind`: admite `reservations`. Servicio "Reservas" en el catálogo del espacio `restavor`: 4800 céntimos/mes, con sus condiciones en `service_versions`. Disparador: una suscripción a un servicio `reservations` solo la crea `approve_reservation_request` (§4.4).
- `spaces`: columna `reservations_enabled boolean default false` (true en `restavor`; en el sembrado, también en `demo`). Solo la cambia la plataforma (§14).
- `establishment_permissions` y `establishment_invitations`: columna `manage_reservations boolean default false` (el Encargado). El Propietario lo tiene todo por su rol.
- `space_memberships`: columna `can_support_reservations boolean default false` (D-E). Solo la cambia el propietario del espacio.
- `access_requests`: columna `interested_in text[]` (`web`, `reservations`).
- `files.category`: admite `agent_knowledge`.
- `notifications.event_type` y `entity_type`: se amplían con los avisos de §9.4 (cada uno con su plantilla y sus preferencias). `notification_deliveries.channel` admite `web_push`.
- `ai_usage`: se generaliza para que `request_id` y `classification_id` puedan ser nulos cuando el uso es de Restavor agents, con `agent_usage_kind` (`document_reading`).
- `establishment_transfers`: no se puede mover a otro espacio un restaurante con Reservas que no esté `closed`.
- Listas del espacio: un restaurante solo con Reservas se enseña con la etiqueta "Solo Reservas" (no como "Configurando"); su `establishments.status` no se usa para nada en Reservas.

### 8.2 Contratación y configuración
**`reservation_service_requests`**: `requested_by`, `created_on_behalf_by` (si la creó el equipo Restavor), `status` (`requested`, `approved`, `rejected`), `rejection_reason`, `service_version_id`, `terms_accepted_by`, `terms_accepted_at` (la aceptación se copia a `terms_acceptances` al aprobar), `reviewed_by`, `reviewed_at`, `idempotency_key`. Una sola solicitud `requested` por restaurante.

**`reservation_settings`** (una fila por restaurante con Reservas):
| Campo | Tipo | Notas |
|---|---|---|
| subscription_id | uuid | la suscripción al servicio Reservas |
| service_status | text | `approved_pending_payment, active, past_due, paused, ending, closed` (§6.12); solo cambia por RPC o barrido |
| grace_days | smallint | por defecto 7 |
| public_slug | text | único; para `/r/[slug]` y el formulario |
| timezone | text | por defecto la del espacio |
| slot_interval_minutes | smallint | 15 o 30 (por defecto 30) |
| large_group_threshold | smallint | por defecto 9 |
| min_notice_minutes / max_advance_days | integer | 120 / 60 |
| customer_cancel_limit_minutes | integer | 120 |
| local_phone_e164 | text | teléfono del local (el que se desvía al agente) |
| transfer_phone_e164 | text | teléfono para pasar llamadas; `CHECK` distinto de `local_phone_e164` |
| forwarding_note | text | "cómo le llegan las llamadas", lo escribe Restavor |
| messaging_enabled | boolean | WhatsApp/SMS activados (por defecto true) |
| brand_color, logo_file_id | text / uuid | del formulario web (los pone Restavor) |
| low_balance_threshold_cents | integer | 500 |
| low_balance_notified_at | timestamptz | aviso una vez por cruce |
| onboarding_completed_at, activated_at, ending_at, closed_at, data_purged_at | timestamptz | |

**`reservation_service_events`**: `type` (`requested, approved, rejected, terms_accepted, activated, past_due, paused, reactivated, ending, closed, purged, support_session`), `actor_id`, `data jsonb`.
**`reservation_shifts`**: `name`, `weekdays smallint[]` (1 = lunes … 7 = domingo), `start_time`, `end_time`, `last_booking_time`, `capacity`, `sort_order`, `active`.
**`reservation_closed_dates`**: `date`, `reason`.

### 8.3 Personas y dispositivos
**`reservation_staff`** (Equipo sin cuenta; también el PIN de Propietarios y Encargados): `kind` (`staff`, `member`), `name`, `user_id` (solo `member`), `pin_hmac` (HMAC con `AGENTS_PIN_SECRET`), `active`, `deactivated_at`. Únicos: (`establishment_id`, `pin_hmac`) entre los activos; (`establishment_id`, `user_id`).
**`reservation_devices`**: `name`, `token_hash`, `activated_by`, `last_used_at`, `revoked_at`.
**`reservation_pin_attempts`**: `device_id`, `failed_count`, `locked_until`.
**`reservation_support_sessions`**: `actor_id`, `reason`, `started_at`, `expires_at`, `ended_at` (D-E).

### 8.4 Reservas
**`reservations`**: `shift_id` (nulo solo si plataforma fuera de turno), `date`, `time`, `starts_at`, `party_size`, `customer_name`, `phone_e164`, `email` (al menos uno mientras no esté anonimizada; web: los dos), `notes` (máx. 300; se ve en ficha y lista; no va en los avisos), `language` (`es`, `en`), `status` (`pending, confirmed, cancelled, no_show`), `source` (`agent, platform, web, manual`), `platform_connection_id`, `external_id` (único por conexión), `platform_name`, `is_new`, `duplicate_flag` (`none, possible`), `pending_reminded_at`, `whatsapp_consent`, `cancel_reason` (`customer, error, other, rejected, platform, customer_link, agent`), `cancelled_at`, `pending_platform_cancel`, `created_by_staff_id`, `created_by_user_id` (el nombre de quien la creó se busca al enseñarla; no se copia), `agent_external_call_id` (el `call_id` de la plataforma), `agent_call_id` (se rellena cuando llega `POST /calls`), `cancel_token` (128 bits, único), `anonymized_at`. Índices: (`establishment_id`, `date`), (`establishment_id`, `phone_e164`), (`establishment_id`, `status`, `date`).
**`reservation_events`** (solo inserción, **sin datos personales**, §6.13): `reservation_id`, `type` (`created, updated, confirmed, rejected, cancelled, no_show, no_show_undone, opened, duplicate_dismissed, notification_sent, notification_failed, notification_skipped, platform_sync_failed, platform_cancel_failed, platform_cancel_done`), `actor_type` (`member, staff, agent, platform, web, customer, restavor_support, system`), `actor_user_id`, `actor_staff_id`, `actor_label` (solo etiquetas genéricas: "Agente", "Web", el nombre de la plataforma, "Restavor (soporte)", "Sistema"; **nunca** el nombre de una persona, que se busca al enseñarlo), `data jsonb`.
**`reservation_duplicate_dismissals`**: par ordenado único, `dismissed_by`.

### 8.5 Agente de llamadas
**`agent_state`** (una fila por restaurante): `manual_state` (`on`, `off`), `off_until` (nulo = hasta que lo enciendan), `off_mode` (`one_hour`, `end_of_shift`, `until_on`), `changed_by_user_id`, `changed_by_staff_id`, `changed_at`, `schedule_mode` (`always`, `windows`).
**`agent_state_events`**: cada encendido/apagado con actor, modo y `off_until`.
**`agent_schedule_windows`**: `weekdays smallint[]`, `start_time`, `end_time`.
**`agent_knowledge_documents`**: `file_id`, `title`, `kind` (`pdf, docx, image`), `status` (`reading, ready, failed`), `extracted_text`, `corrected_text`, `pages`, `archived_at`.
**`agent_knowledge_faqs`**: `question`, `answer`, `sort_order`, `archived_at`.
**`agent_knowledge_settings`**: `instructions` (≤ 2.000), `read_website`, `website_url`, `website_text`, `website_read_at`.
**`agent_knowledge_snapshots`**: `version` (entero que sube de uno en uno; es el `ETag` de la API), `content` (texto compilado), `content_hash`, `delivered_at`, `delivery_status` (`not_needed` sin conector, `pending`, `delivered`, `failed`).
**`agent_calls`**: `external_call_id` (único), `started_at`, `ended_at`, `duration_seconds`, `caller_e164`, `outcome` (§7.5), `forward_reason` (`service_paused, manual_off, outside_hours, no_balance`), `summary`, `transferred_to_e164`, `reservation_id`, `cost_original_micros`, `cost_currency`, `fx_rate`, `cost_eur_micros`, `anonymized_at`.
**`agent_api_keys`**: `prefix` (visible), `key_hash`, `last_used_at`, `revoked_at`. La clave completa se ve una sola vez.

### 8.6 Saldo y mensajería
**`agent_balance_entries`** (libro inmutable): `kind` (`topup, call, whatsapp, sms, refund, adjustment, payout`), `amount_micros bigint` (con signo, millonésimas de euro, D-G), `agent` (`reservations` y los que vengan), `source_type`/`source_id` (llamada, aviso, recarga), `stripe_checkout_session_id` (único), `note`, `created_by`. El saldo se deriva con `agent_balance(establishment)`; se puede guardar una caché, recalculada en tests.
**`agent_topups`** (lo que paga el restaurante, en céntimos): `stripe_checkout_session_id`, `net_cents` (lo que sube el saldo), `vat_cents`, `total_cents`, `vat_rate_percent`, `status` (`created, paid, expired`), `receipt_sent_at`.
**`web_push_subscriptions`** (de la persona, sin `space_id` ni `establishment_id`, como `push_devices`; añadirla a la lista de tablas sin espacio de la suite 42): `user_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`, `created_at`, `last_seen_at`, `revoked_at`.
**`messaging_rates`** (plataforma): `channel` (`whatsapp_utility`, `sms`), `country` (`ES`), `price_micros`, `currency`, `valid_from`. Solo la edita Restavor.
**`fx_rates`** (plataforma): `date`, `currency`, `rate_to_eur`.
**`reservation_notifications`** (avisos a comensales; distinto de `notifications`, que es para usuarios): `reservation_id`, `template`, `channel` (`email, whatsapp, sms`), `language`, `recipient`, `status` (`queued, sent, delivered, failed, skipped`), `skip_reason` (`no_balance, messaging_disabled, platform_source, no_contact, no_consent`), `attempts`, `next_attempt_at`, `provider_message_id`, `cost_micros`, `error`, `anonymized_at`.

### 8.7 Conexiones, operación y datos
**`reservation_platform_connections`**: `provider`, `display_name`, `credentials_encrypted` (cifradas con el sistema de `INTEGRATIONS_VAULT_KEY` del repositorio), `status` (`connected, error, disconnected`), `capabilities jsonb` (`can_cancel`, `can_modify`, `has_webhooks`), `last_sync_at`, `last_error`, `last_error_at`.
**`reservation_incidents`**: `kind` (`platform, email, whatsapp, sms, agent, web, payment, system`), `severity` (`error, info`), `title`, `detail`, `data`, `resolved_at`, `resolved_by`. Cada `error` avisa por email a Restavor (máximo uno por tipo y restaurante cada hora).
**`reservations_api_idempotency`**: `key`, `request_hash`, `response jsonb`, `expires_at`. No se borra: a las 24 h se vacía `response` con un `UPDATE` (puede llevar datos personales) y la clave deja de valer.
**`reservations_rate_limits`**: una fila por `bucket` (clave o IP + ruta) con `count` y `window_start`, que se reinicia con `UPDATE` al empezar cada ventana. No crece ni se borra.
**`reservation_monthly_stats`**: `month`, `source`, `reservations_count`, `people_count`, `calls_count`, `call_minutes`. Sobrevive al borrado.

### 8.8 Seguridad (RLS)
- Personas con cuenta: leen y escriben solo lo de restaurantes donde son Propietario o Encargado (§3.1), según §3.2, por RPC.
- Dispositivos del local: por servidor con `service_role` tras validar token y PIN; nunca acceso directo.
- Equipo del espacio Restavor: `reservation_settings`, turnos, equipo, dispositivos, información del agente, estados, conexiones, incidentes, cifras y saldo. **Nunca** filas de `reservations`, `reservation_events`, `reservation_notifications` ni `agent_calls` salvo con `reservation_support_sessions` abierta (con `aal2`) y `can_support_reservations` (o `platform_roles.can_support`).
- Ninguna política de Reservas depende de `establishments.status` (D-D).
- API del agente y formulario web: solo servidor, con la clave o el `public_slug`.
- Tests SQL: un usuario de Casa Pepe no lee ni una fila de Bar La Plaza; un admin del espacio sin sesión de soporte recibe cero filas de `reservations`; un editor sin `manage_reservations` no ve nada de Reservas.

---

## 9. API

Respuestas JSON en `snake_case`. Fechas `YYYY-MM-DD`, horas `HH:MM` locales del restaurante. Teléfonos de salida en E.164; de entrada se aceptan con espacios o sin prefijo (España por defecto). Errores `{ "error": { "code": "...", "message": "texto para decir al cliente" } }`, idioma con `?lang=es|en`. Documentar en `docs/agents/openapi.yaml`.

### 9.1 API del agente (`/api/agents/v1`)
Cabecera `Authorization: Bearer <clave del agente>` (identifica el restaurante). Límite: 60 peticiones por minuto por clave. Respuesta en menos de 800 ms.

| Método y ruta | Qué hace |
|---|---|
| `GET /restaurant` | Nombre, teléfono del local, teléfono para pasar llamadas, días y turnos, días cerrados de los próximos 60 días, umbral de grupo grande, `service_status` |
| `GET /agent` | **Estado y conocimiento:** `should_answer`, `reason`, `forward_to`, `knowledge_version`, `knowledge_updated_at` |
| `GET /agent/knowledge` | La ficha de conocimiento compilada (§7.4) con su versión. Devuelve `ETag: "<version>"`; con `If-None-Match: "<version>"` igual → `304` sin cuerpo |
| `GET /agent/route?caller=&call_id=` | Para la centralita al entrar una llamada: `{ action: "answer" \| "forward", forward_to, reason }` (§7.6). Con `forward` y `call_id`, registra la llamada como `forwarded` (§7.5) |
| `POST /calls` | Informe de llamada terminada (idempotente por `external_call_id`): inicio, fin, número, resultado, resumen, coste con moneda, número al que se pasó, `reservation_id` si hubo. Descuenta el saldo |
| `GET /availability?date=&party_size=&time=` | §6.5 con `source=agent` |
| `POST /reservations` | Crear. `Idempotency-Key` obligatoria (recomendado: id de la llamada + fecha + hora). Misma clave y cuerpo → respuesta guardada; misma clave con otro cuerpo → `409 idempotency_conflict`. Cuerpo: `date, time, party_size, customer_name, phone, notes?, language?, whatsapp_consent, call_id?` |
| `GET /reservations/search?phone=&date=` o `?name=&date=` | Reservas activas desde hoy de ese teléfono (o nombre + día) |
| `PATCH /reservations/{id}` | Cambiar `date`, `time`, `party_size`, `notes` con reglas del agente |
| `POST /reservations/{id}/cancel` | Cancelar (motivo `agent`) |

Crear devuelve `201 { id, status, summary: "Sábado 26 de septiembre a las 21:00, 4 personas", message }`; si no se puede, `409 { error, alternatives }`.
Códigos de error: `invalid_key`, `service_paused`, `closed_day`, `too_soon`, `too_far`, `full`, `not_a_slot`, `not_found`, `already_cancelled`, `validation_error`, `rate_limited`, `idempotency_conflict`, `platform_locked`. (Que el agente esté apagado no es un error de la API: lo dicen `GET /agent` y `GET /agent/route` con `reason: manual_off`; una llamada ya empezada puede terminar su reserva aunque lo apaguen.)
Los `message` están pensados para decirlos tal cual. Los ejemplos de `docs/agents/guia-conectar-agente.md` deben coincidir con lo programado.

### 9.2 Formulario web (`/api/public/reservas/{slug}`)
- `GET /availability?date=&party_size=` (§6.5 con `source=web`, sin datos internos).
- `POST /reservations`: `date, time, party_size, customer_name, phone, email, notes?, language, privacy_accepted, turnstile_token`. Email y teléfono obligatorios. `notes` = "Alergias o peticiones" (máx. 300).
- Protección: Cloudflare Turnstile, máximo 3 reservas por teléfono y día, 10 intentos por IP cada 10 minutos, CORS abierto solo a estas rutas.
- `POST /api/public/reservas/cancel/{token}`: cancelación del cliente (§6.9).

### 9.3 Webhooks de entrada (`/api/agents/webhooks/...`)
- `platforms/{provider}` (firma validada por cada conector) · `whatsapp` (estados, "no entregable" → SMS, precio, mensajes entrantes → respuesta automática) · `sms` (estados y precio real) · `email` (rebotes → incidente) · `stripe` (`checkout.session.completed` → recarga; `checkout.session.expired` → recarga caducada; firma con `STRIPE_WEBHOOK_SECRET`; idempotente) · `agent/{provider}` (si la plataforma del agente avisa así del final de llamada, se convierte en lo mismo que `POST /calls`).

### 9.4 Avisos a personas de la app
Con el sistema de avisos del repositorio (`notifications`, campana, preferencias) más **push web** (nuevo canal `web_push`, tabla `web_push_subscriptions`, §13).
- **Al momento:** la cola del repositorio solo corre a las 07:00 y 19:00 UTC, así que los avisos de Restavor agents se envían al crearlos (email y push web) y sus reintentos los hace la tarea de cada minuto (§10.6). La cola del repositorio (`drainDeliveryQueue`) **salta** los tipos de aviso de Restavor agents y el canal `web_push`, para que nada salga dos veces. Los avisos de Restavor agents nunca van en el resumen diario. Los avisos de Restavor web no cambian.
- Tipos: `reservation_new` (reserva nueva de agente, web o plataforma), `reservation_group_pending`, `reservation_group_pending_reminder` (2 h), `agent_balance_low`, `agent_balance_empty`, `agent_off_long` (apagado "hasta que lo enciendas" durante más de 12 h), `reservations_payment_due`, `reservations_past_due`, `reservations_paused`, `reservations_activated`, `reservations_ending`, `reservations_closed_purge_soon`, `platform_connection_error`, `reservation_service_request` (al equipo Restavor), `reservation_service_received`, `reservation_service_approved` / `_rejected`, `agent_topup_receipt`. Los emails del ciclo de vida son los de la tabla de §6.12.

---

## 10. Integraciones y tareas programadas

Toda integración va detrás de una interfaz en `src/services/agents/` con una **versión falsa** para desarrollo y tests. Las reales solo se activan con sus variables de entorno.

### 10.1 Plataforma del agente de llamadas
```ts
interface AgentPlatform {
  provider: string;                                   // "fake", "elevenlabs", "propio"…
  pushKnowledge(establishmentId, snapshot): Promise<void>;   // opcional: si la plataforma guarda el conocimiento
  parseCallWebhook(req): Promise<CallReport | null>;          // si avisa por webhook
}
```
- **Agente falso** (obligatorio): página interna `/espacios/<espacio>/reservas/pruebas/agente-falso` (solo el propietario del espacio, y solo con `ENABLE_FAKE_AGENT=true`; nunca en producción) para simular llamadas: elegir restaurante, "entra una llamada" (llama a `/agent/route`), crear/cambiar/cancelar una reserva por la API, terminar la llamada con resultado, resumen y coste (llama a `/calls`). Sirve para probar todo sin ElevenLabs.
- El conector real se añade cuando Bosco conecte su agente (un archivo nuevo que cumple la interfaz, con sus tests).

### 10.2 Plataformas de reservas
```ts
interface PlatformConnector {
  provider: string; displayName: string;
  capabilities: { canCancel: boolean; canModify: boolean; hasWebhooks: boolean };
  validateCredentials(creds): Promise<void>;
  fetchChanges(creds, since: Date): Promise<NormalizedEvent[]>;
  parseWebhook(req, creds): Promise<NormalizedEvent[]>;
  cancel(creds, externalId): Promise<void>;
  modify?(creds, externalId, changes): Promise<void>;
}
// NormalizedEvent: { type: "created" | "updated" | "cancelled", externalId, date, time, partySize, customerName, phone?, email?, notes? }
```
- Webhook si existe + sondeo cada 5 minutos. Guardado idempotente por (`platform_connection_id`, `external_id`). Entran con `source = platform`, `is_new`, `confirmed`, **sin** avisos al cliente.
- La sincronización solo sobrescribe fecha, hora, personas y estado (y solo hacia `cancelled`; nunca reactiva). Nombre, teléfono, email y nota solo al crear o si están vacíos.
- 3 fallos seguidos o credenciales malas → `error`, incidente, email a Restavor y barra "X no conecta desde las HH:MM" a Propietario y Encargado. Se limpia sola al volver.
- **Conector `demo`** obligatorio con `/espacios/<espacio>/reservas/pruebas/plataforma-demo` (solo con `ENABLE_DEMO_PLATFORM=true`): crear, cambiar y cancelar reservas "de plataforma", probar webhooks, sondeo, credenciales malas y cancelación en los dos sentidos. `canCancel = true`, `canModify = false`.
- TheFork, CoverManager…: fuera de esta versión hasta tener documentación y credenciales de socio.

### 10.3 Mensajería
- `MessagingProvider`: `sendWhatsAppTemplate(to, template, lang, params)` y `sendSms(to, text)`. WhatsApp Cloud API de Meta (plantillas de utilidad, una por aviso e idioma, con botón "Cancelar mi reserva" salvo rechazada y cancelada) y SMS con remitente alfanumérico **"Restavor"** registrado en la CNMC (p. ej. Twilio). Versión falsa que guarda los mensajes y los enseña en `/espacios/<espacio>/reservas/pruebas/mensajes` (solo con `ENABLE_FAKE_MESSAGING=true`).
- Un único número de WhatsApp de Restavor para todos los restaurantes; el nombre del restaurante va en el texto.

### 10.4 Email
- Resend con el dominio `restavor.com` verificado, remitente "<Restaurante> <reservas@restavor.com>", `Reply-To` del restaurante. Plantillas sencillas ES/EN (sin imágenes). **Envío directo**, no por la cola de dos veces al día (§6.11). Rebotes → incidente.

### 10.5 Stripe (solo recargas, D-C)
- Checkout Session en modo `payment`, tarjeta, importe con IVA, `metadata` con restaurante y `agent_topups.id`. Webhook firmado → apunte `topup` y recibo. Modo test hasta que Bosco lo active. Variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

### 10.6 Tareas programadas
El cron de Vercel del repositorio corre dos veces al día y no sirve para Reservas. Se usa **`pg_cron` + `pg_net`** de Supabase llamando a `/api/agents/cron/<tarea>` protegidas con `CRON_SECRET` (ya existe). `pg_cron` va en UTC: las tareas "diarias" se lanzan cada hora y comprueban si ya es la hora en `Europe/Madrid` y si ya se hicieron hoy. Todas idempotentes.
- **Las migraciones no programan tareas** (el arranque local sin Docker no tiene `pg_cron`, `pg_net`, Realtime ni Storage, y cada entorno tiene su dirección). Se activan con un script de operación por entorno, `supabase/operaciones/agents-cron.sql`, que guarda la dirección y el secreto en Vault. En local y en los tests, las tareas se lanzan llamando a sus rutas directamente.
- Tiempo real (Broadcast), almacenamiento de documentos y envío de push van detrás de interfaces con versión falsa, para que los tests locales pasen; sus e2e reales se hacen en el entorno de pruebas (Fase 0).

| Cada | Tarea |
|---|---|
| 1 min | Reintentos de avisos a comensales (máx. 3) · envío y reintentos de los avisos a personas de Restavor agents (§9.4) · encender el agente cuyo `off_until` ya pasó (y avisar por Broadcast) · recompilar la ficha de conocimiento si cambió algo |
| 5 min | Sondeo de plataformas · documentos en "Leyendo…" |
| 15 min | Grupos pendientes con más de 2 h → aviso una sola vez |
| Diaria 06:00 (Madrid) | Cambio de moneda del BCE (`fx_rates`) · leer las webs con el interruptor activado |
| Diaria 08:00 (Madrid) | Barrido del ciclo de vida de Reservas y sus emails (§6.12) · aviso de apagado largo |
| Diaria 03:00 (Madrid) | Anonimizar (§6.13) · `reservation_monthly_stats` · vaciar respuestas de idempotencia caducadas |

---

## 11. Pantallas y rutas

Tablet horizontal (1180×820) y móvil (390×844) para Restavor agents; escritorio (1440×900) para Restavor app y el lado de Restavor. Referencia entre paréntesis (archivo en `docs/agents/diseno/`). **"Final"** = diseño definitivo con el aspecto de Restavor web; **"Estructura"** = pantallas con el aspecto antiguo que valen por su contenido, textos y orden (se les aplica Emerald Control).

### 11.1 Restavor app y Restavor agents (lado del restaurante)
| Ruta | Pantalla | Referencia |
|---|---|---|
| `/` | Inicio de Restavor app (§4.3) | Final: `AppInicio`, `AppInicioSoloWeb`, `AppInicioEstados`, `AppInicioMovil`; menú del logo: `AppCambiarProducto` |
| Capa en `/` | Contratar Reservas (§4.4) | Final: `AppContratar` |
| `/web` | Inicio global actual de Restavor web (sin cambios) | — |
| `/agents` | Selector de restaurante o directo a Hoy | patrón del selector de Restavor web |
| `/agents/[id]/reservas` | **Hoy** | Final: `AgentsHoy`, `AgentsHoyMovil` |
| `/agents/[id]/reservas/calendario` | Calendario del mes | Estructura: `Calendario`, `CalendarioMovil` |
| `/agents/[id]/reservas/buscar` | Buscar (nombre o teléfono; 3 últimos números valen; 30 días atrás y futuro) | Estructura: `Buscar` |
| `/agents/[id]/reservas/nueva` | Nueva reserva | Estructura: `NuevaReserva` |
| `/agents/[id]/reservas/[reservaId]` | Ficha (+ capa Cancelar) | Estructura: `Ficha`, `CancelarReserva` |
| `/agents/[id]/reservas/[reservaId]/editar` | Editar | Estructura: `EditarReserva` |
| `/agents/[id]/reservas/agente` | Agente de llamadas · Llamadas + encender/apagar | Final: `AgentsAgente`, `AgentsAgenteMovil`, `AgentsEncenderApagar` |
| `/agents/[id]/reservas/agente/informacion` | Información del agente | Final: `AgentsInfo`, `AgentsInfoMovil`; editar pregunta: `AgenteEditarRespuesta` |
| `/agents/[id]/reservas/agente/horario` | Horario y teléfono para pasar llamadas | Estructura: `AgenteHorarioMovil` |
| `/agents/[id]/reservas/ajustes/horarios` | Días, turnos, aforo, huecos, grupos, días cerrados, límites | Estructura: `Ajustes` |
| `/agents/[id]/reservas/ajustes/equipo` | Equipo con PIN, "Mi PIN para la tablet", dispositivos | Estructura: `AjustesEquipo`, `PinTablet` |
| `/agents/[id]/reservas/ajustes/conexiones` | Estado de plataformas, página de reservas con "Copiar", interruptor WhatsApp/SMS | Estructura: `AjustesConexiones` (la parte del agente ya está en Agente) |
| `/agents/[id]/reservas/primer-uso` | Primer uso: días y turnos → aforo y grupos → equipo y tablet → agente (teléfonos e información) | Estructura: `PrimerUso` |
| `/agents/[id]/reservas/ajustes/historial` | Historial de Reservas: cambios de ajustes, encendidos/apagados, sesiones de soporte ("Restavor entró como soporte · motivo · hora") | Sin maqueta: lista sencilla con el estilo de `AgentsAgente` › Llamadas |
| `/agents/[id]/reservas/exportar` | Descargar todas las reservas en Excel (Propietario) | Botón en Ajustes y en "Reservas cerrada" |
| `/agents/[id]/saldo` | Saldo y recarga | Final: `AgentsSaldo`; móvil: `AgenteSaldoMovil` (estructura, contenido) |
| `/agents/[id]/plan` | Plan de Reservas (48 € + IVA/mes), cobros, recibos, darse de baja | Estructura: `AjustesPlan` (sin plan anual) |
| `/agents/[id]/condiciones` | Aceptar las condiciones de Reservas (si se pidió en su nombre, §4.4) | Final: `AgentsCondiciones` |
| `/agents/[id]/pendiente-de-pago` | "Aprobado: datos para pagar" (`approved_pending_payment`), con "Subir justificante" (`upload_payment_receipt()` del repositorio) | Final: `AgentsPendientePago` |
| `/agents/[id]/ayuda` | Ayuda: preguntas frecuentes de uso y "Escribir a Restavor" (con el sistema de mensajes o de ayuda que ya exista) | Sin maqueta |
| `/agents/[id]/mas` (móvil) | Más | Final: `AgentsMasMovil` |
| `/agents/[id]/cuenta-cerrada` | Reservas cerrada: solo descargar Excel | Estructura: `CuentaCerrada` |

Barras y estados de filas: `HojaAvisos` y `HojaReservas` (estructura).

### 11.2 Lado de Restavor (espacio `restavor`)
- Menú del espacio (solo si `spaces.reservations_enabled`): entrada nueva **Reservas** (`/espacios/<espacio>/reservas`): solicitudes de contratación (aprobar / rechazar con motivo; "Crear solicitud para este restaurante"), restaurantes con Reservas (estado del servicio, saldo, estado del agente, conexiones con error, pagos pendientes), incidentes de Reservas y, con sus variables activadas, **Pruebas** (agente falso, plataforma demo, mensajes falsos).
- Ficha del restaurante: pestaña nueva **Reservas** con: estado del servicio y sus eventos; ajustes de horarios, equipo y dispositivos, información del agente (lo mismo que ve el restaurante, sin datos de comensales); plataformas (añadir, probar, cambiar clave, desconectar); clave del agente (crear, copiar una vez, cambiar); teléfonos del agente y "cómo le llegan las llamadas"; color y logo del formulario y código para pegar; saldo con movimientos, "Registrar recarga" y "Ajuste" (con motivo); cifras de reservas y llamadas; **"Abrir como soporte"** (§3.4, solo quien esté marcado). Claves, credenciales y ajustes de saldo piden sesión `aal2`.
- Los cobros de Reservas se registran con la pantalla de cobros que ya existe (Finanzas).
- Referencia de contenido (estructura antigua, se integra en lo que ya existe): `PanelSolicitudes`, `PanelRestaurante`, `PanelErrores`, `PanelCobros`.

### 11.3 Plataforma (`/administracion`)
- Tarifas de mensajería (`messaging_rates`), comprobación de Stripe y el interruptor `spaces.reservations_enabled`.
- "Abrir Reservas como soporte" para quien tenga `platform_roles.can_support` (§3.4).

### 11.4 Público
| Ruta | Pantalla | Referencia |
|---|---|---|
| `/r/[slug]` | Página de reservas propia | Estructura: `WidgetWeb` |
| `/widget/[slug]` + `/reservar.js` | Formulario para incrustar (iframe que ajusta su altura) | Estructura: `WidgetWeb`, `WidgetHecha`, `WidgetSinSitio` |
| `/c/[token]` | Ver y cancelar mi reserva | Estructura: `CancelarCliente` |
| Plantillas | Email, WhatsApp y SMS | Estructura: `EmailConfirmacion`, `WhatsAppConfirmacion` |

El formulario usa el color y el logo del restaurante, detecta ES/EN con selector manual y tiene "Alergias o peticiones" (opcional) antes de la privacidad. Pie: "Reservas con Restavor".

---

## 12. Diseño

### 12.1 Sistema
- **Emerald Control** del repositorio: tokens de `apps/web/src/styles/tokens.css`, componentes de `components/ui/`, `/styleguide`. Letra Inter. Nunca un hexadecimal suelto: los colores nuevos se añaden como tokens.
- En tablet, el menú lateral de Restavor agents mide unos 224 px, con **icono y nombre** en cada destino.
- Zonas táctiles de 44 px como mínimo, botón principal de 52 px en tablet, números tabulares en horas y cifras.
- `docs/agents/diseno/emerald-maqueta.css` es la hoja que se usó para la maqueta: **no se copia**; sirve para ver qué tokens nuevos hacen falta.

### 12.2 Tokens nuevos
| Token | Valor | Uso |
|---|---|---|
| `origin-agent` / `-bg` | `#5B4B9A` / `#ECE8F6` | origen Agente |
| `origin-platform` / `-bg` | `#2F6690` / `#E3EEF6` | origen Plataforma |
| `origin-web` / `-bg` | `#9A3469` / `#F8E6EF` | origen Web (rosa, para no confundirse con el verde de Restavor) |
| `origin-manual` / `-bg` | `#3F4A5A` / `#E9ECF1` | origen Manual |
| `pending-text` / `-bg` / `-row` / `-border` | `#4A3A00` / `#F5D76E` / `#FDF7E3` / `#F0DC94` | Pendiente |
| `meter-warn` | `#B7791F` | aforo ≥ 85 % |
| `agent-on-bg` / `-border` | `#E9F5EF` / `#BFE0CF` | tarjeta "Agente encendido" |
| `agent-off-bg` / `-border` | `#F1F3F1` / `#D5DCD8` | tarjeta "Agente apagado" |
Todos los pares cumplen contraste AA (comprobado).

### 12.3 Textos
Español de España, cercano y corto. Los textos de las pantallas "Final" son los definitivos; los de "Estructura", también, salvo lo que este documento cambia:
- Sin plan anual; saldo a precio real (sin precios fijos de WhatsApp o SMS); "Restavor" en lugar de "[Nombre de la app]".
- **Facturas:** la app no las emite. Donde una maqueta diga "factura" de una recarga (`AgentsSaldo`, `AgenteSaldoMovil`, `AjustesPlan`), se dice **"recibo"** ("Te enviamos el recibo por email"). En Plan y pagos, la factura oficial de una cuota aparece solo si Restavor la adjunta (`attach_invoice_to_charge`).
- `AppContratar`: "Te llega el primer cobro" se ve en **Restavor agents › Plan y pagos**, no en "Pagos y facturas" de Restavor web.
- En pausa, el agente pasa las llamadas al local (D-K): donde una maqueta diga que responde "ahora no podemos gestionar reservas", se cambia.

Todos en `src/i18n/es.ts` (sección `agents`); ES/EN solo en lo que ve el comensal.

---

## 13. Requisitos no funcionales
- **Seguridad:** RLS en todo; permisos en servidor (§3.2); claves de API, PIN y tokens de dispositivo con hash; credenciales cifradas con el sistema del repositorio; cookies `httpOnly`, `secure`, `sameSite=lax`; límites de peticiones; auditoría de soporte.
- **Datos personales (RGPD):** Restavor es encargado del tratamiento de los datos de los comensales. Enlaces a privacidad y condiciones en el formulario y los emails. Conservación según §6.13. Llamadas: solo resumen, sin grabación ni transcripción. El agente avisa al empezar de que es un asistente automático (texto en `docs/agents/guia-conectar-agente.md`).
- **Rendimiento:** Hoy carga en menos de 1,5 s en una tablet media con 4G; la API del agente responde en menos de 800 ms.
- **Fiabilidad:** reservas atómicas con bloqueo (§6.3); todo idempotente.
- **Accesibilidad:** WCAG 2.1 AA (axe en los e2e); nunca solo color.
- **Push web:** Web Push con claves VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`); en iPhone requiere la app instalada en la pantalla de inicio.
- **Navegadores:** Safari iOS 16.4+, Chrome Android, escritorio (dos últimas versiones).
- **Entornos:** local (el arranque sin Docker del repositorio, con integraciones falsas), **pruebas** (se crea en la Fase 0: rama `agents`, despliegue de vista previa de Vercel y un segundo proyecto de Supabase "Restavor pruebas" con el sembrado) y producción (solo cuando Bosco lo pida).

## 14. Fuera de alcance (esta versión)
- Plano de mesas, duración por reserva, lista de espera, recordatorio el día antes.
- Crear o cambiar reservas sin conexión.
- Conectores reales de plataformas hasta tener su API; Reservar con Google.
- Conector real del agente de llamadas (lo hará Bosco al final); grabación o transcripción de llamadas.
- Emitir facturas (bloque legal y agente de facturas, más adelante).
- WhatsApp desde el número de cada restaurante; emails desde su dominio.
- Reservas para restaurantes de **otros espacios** de mantenimiento: en producción solo el espacio `restavor` tiene `spaces.reservations_enabled = true` (en el sembrado, también `demo`, para probar).
- Restavor agents en la app Expo (sigue la decisión pendiente de la app en tiendas).
- Otros agentes de Restavor agents (el armazón queda preparado para añadirlos).
- Idiomas distintos de español e inglés.

---

## 15. Plan de construcción por fases

### 15.0 Definición de hecho (todas las fases)
- [ ] Pasan `typecheck`, `lint`, los tests unitarios, **todas** las suites SQL (con las nuevas `reservas_*.sql`, cada regla `RN-` citada) y los e2e de Playwright, igual que en la CI del repositorio.
- [ ] Las migraciones nuevas se aplican desde cero sobre las existentes sin errores (en local y en la CI).
- [ ] Todo subido a la rama `agents`, migraciones aplicadas al proyecto **de pruebas** y el despliegue de vista previa funcionando. **Nada** en producción ni en su rama.
- [ ] Capturas de Playwright de cada pantalla tocada (1180×820 y 390×844; lado Restavor 1440×900) comparadas con `docs/agents/diseno/capturas/` y con los `.dc.html`. Diferencias corregidas o explicadas.
- [ ] Un subagente revisa el diff contra los criterios de la fase y las reglas de `CLAUDE.md`; se corrigen los fallos reales.
- [ ] `docs/ROADMAP.md` con el hito de la fase: criterios cumplidos, decisiones técnicas y **pasos para que Bosco lo pruebe a mano en el entorno de pruebas** (qué dirección abrir, con qué usuario del sembrado y qué debería ver). Decisiones nuevas en `docs/DECISIONES.md`.

### Fase 0 · Entorno de pruebas (antes de programar nada)
- **ENT-01** Rama `agents` en GitHub (si no se creó al meter el kit). Un segundo proyecto de Supabase "Restavor pruebas" (plan gratuito, región UE) con **todas** las migraciones y los sembrados. Variables de ese proyecto en Vercel **solo para vista previa** (Preview), nunca en Production. Cada subida a `agents` crea una dirección de vista previa que usa "Restavor pruebas".
- **ENT-02** `docs/agents/PRUEBAS.md`: dirección de vista previa, usuarios del sembrado con sus contraseñas de prueba y cómo aplicar las migraciones de cada fase a "Restavor pruebas".
- Claude Code explica a Bosco, paso a paso y en sencillo, lo que tiene que hacer él (crear el proyecto de Supabase, pegar variables en Vercel) y lo comprueba después.
- [ ] Bosco entra en la dirección de vista previa con un usuario del sembrado y ve Restavor web funcionando igual que en producción.

### Fase A · Restavor app (la puerta común)
- **APP-00** Migraciones mínimas para esta fase: `services.kind = reservations` y el servicio Reservas con su versión de condiciones (`service_versions`), `spaces.reservations_enabled`, `establishment_permissions.manage_reservations`, `access_requests.interested_in`, `reservation_service_requests`, `reservation_service_events`, `reservation_settings` (solo las columnas del ciclo de vida) y los tipos de aviso nuevos que usa APP-04. El resto de §8 llega en la Fase B. Los tests de esta fase crean sus propios datos (el sembrado de Reservas llega en la Fase B).
- **APP-01** Decisiones D-A a D-K en `docs/DECISIONES.md` y `CLAUDE.md` actualizado (excepciones de §2). El "Agente Restavor web" de Restavor web (`/espacios/<espacio>/agente`) **no se toca**: sigue "Próximamente"; es otra cosa distinta de Restavor agents.
- **APP-02** `/` = Inicio de Restavor app; el Inicio global actual a `/web`; `my_products()`; reglas de §4.3 (cuándo se salta el Inicio) y el cambio de producto desde el logo; "Volver al inicio de Restavor". `/agents` existe como página mínima (el armazón completo llega en la Fase B).
  - [ ] Cliente con web y Reservas ve las dos tarjetas; solo web ve "Contratar Reservas"; solo Reservas entra directo en `/agents`; un trabajador del espacio entra directo en Restavor web.
  - [ ] Nada de Restavor web cambia de comportamiento salvo la dirección de su inicio (tests existentes en verde).
- **APP-03** Marca por producto y "Entrar en Restavor".
- **APP-04** Contratar Reservas (§4.4) con el email "Hemos recibido tu solicitud", la casilla "¿Qué te interesa?" en la solicitud de acceso y, en el espacio, la lista de solicitudes con "Crear solicitud para este restaurante" (aprobar llega en la Fase E).

### Fase B · Cimientos de Restavor agents
- **AGT-01** Migraciones del resto de §8 con RLS, eventos, auditoría e idempotencia.
  - [ ] Suite SQL: aislamiento entre restaurantes; admin del espacio sin sesión de soporte no ve reservas; editor sin `manage_reservations` no ve nada; `reservation_events` y `audit_log` no guardan datos personales de comensales.
- **AGT-02** `canReservations` con tests de toda la tabla §3.2 (incluido qué se oculta en la tablet sin PIN); permiso `manage_reservations` en "Usuarios y accesos" ("Gestionar Reservas") y en las invitaciones; casilla "Soporte de Reservas" en el equipo del espacio (solo el propietario).
- **AGT-03** Armazón de Restavor agents (§5.1), tokens de §12.2 y componentes: chip de origen, chip de estado, "Nueva", fila de reserva, barra de aforo, tarjeta de estado del agente, teclado de PIN. Añadirlos a `/styleguide`.
- **AGT-04** Dominio en `src/core/reservations/`: fechas en la zona del restaurante (incluido cambio de hora), turnos y huecos, E.164.
- **AGT-05** Sembrado (§16) en local y en "Restavor pruebas".

### Fase C · La agenda
- **RES-01 Hoy** (`AgentsHoy`, `AgentsHoyMovil`): fecha con flechas y "Hoy", Buscar, Nueva reserva, indicador del agente, barras de aviso, filtros por origen con contadores (se recuerdan en el dispositivo), un bloque por turno con aforo y filas.
  - [ ] Filas por hora: hora, nombre, nota, personas, origen (plataforma con su nombre). Canceladas tachadas **al final de su hora**; "No vino" en gris.
  - [ ] Resumen "N reservas · M personas · K pendientes" (sin contar canceladas ni "No vino").
  - [ ] Barra de grupos pendientes con "Revisar", que lleva a la primera pendiente.
- **RES-02 Nueva reserva** (`NuevaReserva`): fecha (Hoy, Mañana, Otro día), personas (1–6 y 7+), turno, hora, nombre, teléfono, email opcional, idioma de avisos, nota con atajos (Trona, Terraza, Alergia, Cumpleaños); "Quedan X de Y plazas"; aviso de aforo; días cerrados y pasados no seleccionables.
  - [ ] Obligatorio: nombre y (teléfono o email). Teléfono válido.
- **RES-03 Ficha** (`Ficha`): hora grande, nombre, personas, turno y fecha, estado, origen, nota, teléfono con botón **"Llamar"** (`tel:`), "Ha venido N veces · ha fallado M veces", historial legible, Editar, "No vino" (desactivado hasta la hora, con el texto "desde las HH:MM") y "Cancelar reserva". Al abrirla se quita "Nueva".
- **RES-04 Editar**, **RES-05 Cancelar**, **RES-06 No vino**, **RES-07 Confirmar/Rechazar**, **RES-08 Duplicadas**, según §6.
- **RES-09 Buscar**: nombre o teléfono (bastan los 3 últimos números), últimos 30 días y todas las futuras; resultados agrupados en **"Próximas"** y **"Últimos 30 días"**, con la coincidencia resaltada.
- **RES-10 Calendario**: reservas y personas por día, barra por origen, días cerrados **rayados**, **punto amarillo** si hay pendientes, **total del mes**; tocar un día abre Hoy en ese día.
- **RES-11 Tiempo real** (§6.14, con la versión falsa en local), **RES-12 Ajustes › Horarios** (incluida la regla de no quitar turnos con reservas futuras, §6.2) y **RES-13 Primer uso**, según §6 y las pantallas de §11.1.
- [ ] Tests unitarios y SQL de §6.1–6.10 con todos los ejemplos. E2E: crear, editar, cancelar, "No vino", confirmar grupo, "No es duplicada", buscar, calendario.

### Fase D · Equipo con PIN, tablet del local y soporte
- **EQU-01** Ajustes › Equipo (`AjustesEquipo`): lista de personas con rol y forma de entrar; añadir persona del Equipo (nombre + PIN de 4 cifras, repetido); "Mi PIN para la tablet" de Propietarios y Encargados; **invitar Propietario o Encargado por email** (con `establishment_invitations` y su aprobación por el equipo del espacio, como ya funciona); cambiar PIN; quitar (desactiva, conserva historial). Un Encargado solo gestiona el Equipo. No se puede quitar al último Propietario.
- **EQU-02** Dispositivo del local (§3.3) con `PinTablet`, incluidas las excepciones de `proxy.ts`. **EQU-03** Varios restaurantes (selector). **SOP-01** Sesión de soporte de Reservas (§3.4) con `aal2` y Ajustes › Historial.
- [ ] E2E con Propietario, Encargado, Equipo con PIN, admin del espacio sin y con soporte. Test: la tablet sigue abierta aunque caduque la sesión personal de quien la activó.

### Fase E · Contratación, cobro y saldo
- **COB-01** Aprobar/rechazar solicitudes (§4.4), aceptar condiciones, "Aprobado: datos para pagar" y ciclo de vida (§6.12) con **todos sus emails**, barras y transiciones; cobro mensual del servicio con el motor existente; pago manual con la pantalla de Finanzas y el gancho de reactivación de Reservas.
  - [ ] Test: un cobro de Reservas vencido **no** pausa el restaurante en Restavor web, y un impago de Restavor web no pausa Reservas.
- **COB-02** Plan y pagos de Reservas; darse de baja; Reservas cerrada con Excel y anonimización a los 30 días.
- **SAL-01** Libro del saldo en millonésimas, pantallas de Saldo, aviso de saldo bajo y saldo a 0; recarga manual por Restavor.
- **SAL-02** Recarga con Stripe (modo test) con webhook idempotente y recibo.
- **RVR-01** Lado de Restavor (§11.2): entrada "Reservas" del espacio y pestaña "Reservas" de la ficha.
- [ ] Tests del ciclo con fechas simuladas: vence → 7 días → pausa → pago parcial (sigue en pausa) → pago completo → activa; baja → cerrada → anonimizado. Tests del libro: recarga doble del mismo webhook = un solo apunte; la recarga sube el importe sin IVA.

### Fase F · Avisos a comensales
- **AVI-01** Motor de avisos (§6.11) con envío directo y reintentos; **AVI-02** emails ES/EN (`EmailConfirmacion`); **AVI-03** WhatsApp con respuesta automática y paso a SMS; **AVI-04** SMS "Restavor"; **AVI-05** `/c/[token]` ES/EN (`CancelarCliente`); **AVI-06** coste real en el saldo (`messaging_rates`, precio real del SMS).
- [ ] Tests: con email → solo email; solo teléfono con saldo → WhatsApp y descuenta su precio exacto; no entregable → SMS; saldo menor que el precio → no sale y queda anotado; plataforma → nada; EN → plantilla EN.

### Fase G · Agente de llamadas
- **LLA-01** API §9.1 con idempotencia, límites, mensajes para voz y `docs/agents/openapi.yaml`; clave del agente en la ficha (Restavor).
- **LLA-02** Agente falso (§10.1).
- **LLA-03** Llamadas (§7.5) con coste en el saldo.
- **LLA-04** Encender y apagar (§7.1) con la ventana "¿Hasta cuándo?", encendido automático y el indicador en Hoy.
- **LLA-05** Horario y teléfono para pasar llamadas (§7.2, §7.3).
- **LLA-06** Información del agente (§7.4): documentos con lectura y corrección, web, preguntas, instrucciones, lo que ya sabe y ficha de conocimiento.
- **LLA-07** `routeCall` (§7.6) y `GET /agent/route`.
- [ ] Tests de `routeCall` con todas las combinaciones (en `ending` coge); e2e con el agente falso: entra llamada → coge → crea reserva → termina → aparece en Llamadas con su duración y coste, enlazada a la reserva, y el saldo baja; apagar 1 hora → la siguiente llamada se pasa al local y aparece en Llamadas como "No la cogió · agente apagado" → a la hora vuelve a coger.
- Al terminar, actualizar `docs/agents/guia-conectar-agente.md` con ejemplos reales.

### Fase H · Formulario web
- **WEB-01** `/reservar.js`, `/widget/[slug]` y `/r/[slug]` (`WidgetWeb`, `WidgetHecha`, `WidgetSinSitio`) con color y logo, ES/EN, "Alergias o peticiones", estados de grupo, sin sitio y servicio en pausa. **WEB-02** Turnstile y límites.

### Fase I · Plataformas
- **CON-01** Interfaz y registro de conectores, credenciales cifradas; **CON-02** conector demo; **CON-03** webhook + sondeo idempotente; **CON-04** cancelación en los dos sentidos y edición bloqueada (`EditarReserva`); **CON-05** gestión en la ficha (Restavor) y barra de error.

### Fase J · App instalable, sin conexión y pulido
- **PWA-01** Instalable ("Restavor"); **PWA-02** sin conexión (§6.14); **PWA-03** push web con explicación previa; **PWA-04** sonido de reserva nueva en la tablet (se puede silenciar); **QA-01** revisión completa: accesibilidad, rendimiento y todas las pantallas contra `docs/agents/diseno/`.

---

## 16. Datos de ejemplo (`supabase/seed/reservas-demo.sql`, después del sembrado del espacio `demo`)
- Todo va en el espacio `demo`, con `spaces.reservations_enabled = true` y el servicio Reservas en su catálogo (48 €). No depende de los planes del sembrado demo (que están desfasados): a Casa Pepe se le pone el plan de mantenimiento que ya exista en `demo`.
- **Fecha fija para tests:** sábado 26/09/2026; los e2e congelan el reloj a las 14:10 (`Europe/Madrid`). El sembrado copia además las reservas en el próximo día abierto desde hoy (sin "No vino") para probar a mano.
- Contraseñas de prueba iguales para todos los usuarios nuevos, apuntadas en `docs/agents/PRUEBAS.md` (nunca en producción).
- **Casa Pepe** (Sevilla, grupo "Casa Pepe", un plan de mantenimiento **y** Reservas `active`, `public_slug` `casa-pepe`, saldo 7,40 €): cierra los lunes; Comida 13:00–16:00 (última 15:00, aforo 40) y Cena 20:00–23:30 (última 22:30, aforo 60) de martes a domingo; huecos cada 30; grupos desde 9; cerrado el 12/10; teléfono del local 954 000 000; teléfono para pasar llamadas 600 123 456; "cómo le llegan": "no contestáis en 4 tonos".
  - Personas: José García (`local_owner`, `jose@casapepe.test`), María García (`local_owner`), Luis Martín (`editor` con `manage_reservations`), Equipo: Ana Ruiz (PIN 1234), Diego Navas (PIN 5678).
  - Reservas del 26/09 (las de `AgentsHoy`): Lucía Fernández 13:30 · 2 · TheFork; Raúl Moreno 13:30 · 2 · manual · No vino; Javier Ruiz 14:00 · 4 · agente · Nueva · "Una trona"; Carmen Ortiz 14:00 · 3 · manual; Andrés Martínez 14:30 · 12 · agente · pendiente; Pablo Serrano 14:30 · 2 · web · "Terraza si es posible"; Elena Castro 15:00 · 2 · CoverManager · cancelada; Marta López 20:30 · 4 · agente · Nueva; Sergio Gil 21:00 · 6 · TheFork · "Alergia al marisco"; Nuria Vidal 21:00 · 2 · web; Tomás Herrera 21:30 · 2 · manual; Iván Rojas 22:00 · 5 · TheFork. Más reservas repartidas por el mes y un par de posibles duplicadas (Laura Vega).
  - Las 8 llamadas de `AgentsAgente` (con sus costes), agente encendido, horario "todo el día".
  - Información: 3 documentos (Carta de otoño y Alérgenos "Lo conoce"; Menú de grupos "Leyendo…"), las 5 preguntas frecuentes, las instrucciones de ejemplo y la web activada.
  - Saldo: recargas y gastos que dejan 7,40 € y el gasto de septiembre de `AgentsSaldo`.
  - Conexiones `demo` como "TheFork" (conectada) y como "CoverManager" (en error).
- **Taberna Sol**: solo Reservas (sin plan de mantenimiento), propietaria Rosa Prieto (`local_owner`, `rosa@tabernasol.test`), con "Cena 1ª tanda" 20:00–21:30 (última 21:00, aforo 30) y "Cena 2ª tanda" 22:00–23:30 (última 23:00, aforo 30) de martes a sábado (tests de alternativas).
- **Casa Pepe Centro**: José es Encargado (para el selector de restaurante).
- **Bar La Plaza**: otro grupo y otra dueña (Carla Sanz, `carla@barlaplaza.test`), para el aislamiento; saldo 1,80 €.
- **Magariños** (ya existe en el sembrado demo): solo web, para "Contratar Reservas".
- Restaurantes con Reservas en cada estado (`approved_pending_payment`, `past_due`, `paused`, `ending`, `closed`), una solicitud de contratación `requested` y otra `rejected`.
- Equipo del espacio: la propietaria del espacio demo con "Soporte de Reservas" marcado y un administrador sin marcar. La propietaria es la que abre **Pruebas** (agente falso, plataforma demo, mensajes falsos). Para poder probar lo que pide segundo paso (`aal2`), el sembrado le registra una app autenticadora con un secreto de prueba fijo (apuntado en `docs/agents/PRUEBAS.md`, para añadirlo al móvil de Bosco); los e2e generan el código con ese secreto.

## 17. Lo que aporta Bosco
Proyecto de Supabase "Restavor pruebas" (Fase 0, con ayuda de Claude Code) · dominio `app.restavor.com` (CNAME en GoDaddy) · dominio `restavor.com` verificado en Resend (región UE) · Meta Business verificado con un número dedicado para WhatsApp y plantillas aprobadas · proveedor de SMS con el alias "Restavor" registrado en la CNMC · Cloudflare Turnstile · cuenta de Stripe (modo test y luego real) · la conexión de su agente de llamadas (plataforma y números de teléfono por restaurante) · textos legales revisados (privacidad, condiciones de Reservas, encargado del tratamiento) · plan Pro de Vercel al publicar · documentación de socio de cada plataforma real.

Antes de dar de alta a restaurantes reales (D-J): bloque legal con textos revisados (privacidad, condiciones de Reservas, contrato de encargado del tratamiento que cubra el modo soporte) y sus direcciones en `LEGAL_PRIVACY_URL` y `LEGAL_TERMS_URL`.

## 18. Pendiente de decidir
- Textos legales y plazo de conservación (24 meses propuesto; configurable).
- Conexión real del agente (proveedor, cómo informa de cada llamada y su coste).
- Bloque legal y fiscal (facturas de cuotas y recargas).
- Si Reservas se ofrecerá a restaurantes de otros espacios de mantenimiento.
