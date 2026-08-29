# Cuotly — PRD (documento de producto)

Este documento resume qué es Cuotly, por qué existe, y qué construimos primero. Es la
versión condensada de `docs/ESPECIFICACION-MAESTRA.md` (el documento completo de 180
secciones). Cuando este PRD diga "ver Especificación Maestra §N", ahí está el detalle
completo de esa regla; no lo repetimos aquí para no duplicar contenido que hay que
mantener en dos sitios.

**Si algo de este PRD contradice a la Especificación Maestra, para y pregunta a Bosco —
no asumas cuál de los dos prevalece.**

---

## 1. Qué es Cuotly

Cuotly es una plataforma SaaS multiempresa que gestiona la relación operativa entre
**proveedores de mantenimiento digital** (empresas que mantienen webs de restaurantes) y
sus **restaurantes clientes**.

Nace como herramienta interna de Restavor (la empresa de Bosco), pero está construida
desde el principio para venderse como SaaS a otras empresas de mantenimiento: dos negocios
sobre la misma base de código.

Cuotly responde a dos preguntas en todo momento: **¿qué está pasando ahora?** y **¿qué
necesita atención o una decisión?** (Especificación Maestra §1).

## 2. Estructura del producto

```text
Plataforma Cuotly
└── Espacios de mantenimiento         (una empresa que da mantenimiento; Restavor es el primero)
    └── Grupos de clientes            (una cadena o empresa cliente)
        └── Establecimientos          (un restaurante concreto)
```

Cada espacio es una "empresa inquilina" de Cuotly: sus datos, su equipo, sus restaurantes y
sus planes están completamente aislados de los de cualquier otro espacio. Un mismo usuario
puede tener papeles distintos en varios espacios, grupos o establecimientos a la vez.
(Especificación Maestra §2.)

## 3. El núcleo operativo: Solicitud → Trabajo → Tarea

Esto es lo que hace Cuotly, día a día, para cualquier espacio:

1. Un restaurante crea una **Solicitud** (pide un cambio en su web).
2. El equipo de mantenimiento la clasifica y el restaurante la acepta.
3. Al aceptarse, se crea un **Trabajo** y se asigna a un trabajador.
4. El trabajo puede dividirse en **Tareas** internas.
5. El trabajador publica el resultado.

Este ciclo corre sobre tres relojes de tiempo distintos, medidos en horas laborables
configurables por espacio (para Restavor: lunes 09:00 a sábado 14:30, con festivos):

- **Atención inicial**: desde que llega la solicitud hasta la primera respuesta interna.
- **Plazo para empezar**: desde que se asigna hasta que el trabajador pulsa "Comenzar".
- **Plazo de ejecución**: desde "Comenzar" hasta la publicación.

(Detalle completo: Especificación Maestra §32–49, reloj contractual en §44.)

## 4. Modelo comercial (resumen)

Hay **dos capas de dinero** distintas, que no hay que confundir:

1. **Lo que Bosco cobra a otros espacios** por usar Cuotly (planes Pro y Agency del propio
   Cuotly). Ver Especificación Maestra §4.
2. **Lo que cada espacio cobra a sus restaurantes** por el mantenimiento (planes Básico,
   Impulso y Premium de Restavor, más Menú Diario como servicio aparte). Ver Especificación
   Maestra §5–6.

Cada restaurante contrata un plan que da derecho a un número de "cambios" por categoría al
mes (pequeño / mediano / grande / fotográfico), que no se acumulan de un mes a otro.

**Importante para la Fase 1**: de momento Cuotly no cobra dinero de forma automática. Solo
lleva la cuenta de lo que se debe y lo que se ha pagado; el pago en sí es manual
(transferencia o Bizum), confirmado a mano por una persona. Ver Especificación Maestra §80.

## 5. Roles (resumen)

Hay dos jerarquías de roles completamente separadas:

**Del lado del proveedor de mantenimiento** (Especificación Maestra §11–13):
- Propietario de Cuotly (Bosco, control global de la plataforma).
- Propietario del espacio (control total de su empresa de mantenimiento).
- Administrador de mantenimiento.
- Trabajador.
- "Supervisor" no es un rol: es una relación entre un Administrador y los Trabajadores que
  supervisa.

**Del lado del restaurante cliente** (Especificación Maestra §14):
- Propietario global (de todo un grupo de establecimientos).
- Propietario local (de un establecimiento).
- Editor.
- Consulta (solo lectura).

**Regla que no debe romperse nunca**: el restaurante no ve nombres ni fotos individuales
del equipo de mantenimiento. Toda comunicación aparece como "Equipo de mantenimiento"
(Especificación Maestra §15). Esto aplica desde el primer hito que tenga mensajería.

## 6. Principios de producto (aplican a todo lo que se construya)

(Especificación Maestra §3, condensado)

1. **Claridad antes que densidad**: no añadir gráficos o módulos solo para parecer
   avanzado.
2. **Separación estricta de contextos**: la interfaz siempre indica en qué espacio,
   grupo o establecimiento está el usuario.
3. **Permisos en el servidor, no solo ocultos en la pantalla**: ocultar un botón no basta;
   toda operación se valida en el servidor. Ver también criterio de aceptación §173.
4. **Historial antes que sobrescritura**: los cambios importantes generan versiones o
   registros de auditoría, nunca se pierden silenciosamente.
5. **Automatización con control humano**: Cuotly puede recomendar y clasificar, pero las
   decisiones sensibles las confirma una persona.
6. **No inventar datos**: un informe o panel debe distinguir siempre entre dato medido,
   dato manual, estimación y "todavía no hay datos".
7. **El cliente no ve la organización interna** del equipo de mantenimiento.

## 7. Arquitectura técnica (resumen)

Stack ya decidido (Especificación Maestra §151):

| Componente | Elección |
|---|---|
| Web | Next.js + TypeScript, alojado en Vercel |
| Móvil | React Native + Expo (iOS y Android) |
| Base de datos | PostgreSQL, gestionado por Supabase |
| Autenticación | Supabase Auth |
| Archivos | Supabase Storage |
| Tiempo real | Supabase Realtime |
| Tareas programadas y colas | Supabase Cron / Supabase Queues |
| Correo | Resend |
| Notificaciones push | Expo Notifications (sobre FCM/APNs) |
| Pagos | Manual (transferencia / Bizum), no Stripe inicialmente |

Principios técnicos que se aplican desde el primer hito (Especificación Maestra §152):

- **Un único backend multiempresa**: nunca una base de datos ni un proyecto por
  restaurante ni por espacio. El aislamiento entre empresas se hace con políticas RLS
  (reglas de la propia base de datos que impiden ver filas ajenas), no solo con lógica de
  la aplicación.
- El cliente (web o móvil) **nunca es la autoridad final**: cálculos de permisos, consumos,
  pagos y contadores de tiempo se hacen y se validan en el servidor.
- Entornos separados de desarrollo, pruebas y producción. Los datos reales de producción no
  se copian libremente a pruebas.
- Los movimientos financieros y de consumo se registran como un **libro de movimientos
  inmutable** (una lista de hechos que no se borran ni se editan), no como un simple número
  que se sobrescribe. Esto es lo que permite auditar y corregir sin perder el rastro.

## 8. Alcance de la Fase 1 — decidido con Bosco el 29/08/2026

La Fase 1 es el **núcleo operativo mínimo**, construido en paralelo para web y para móvil
desde el primer hito (decisión de Bosco: no se retrasa el móvil a una fase posterior).

### Entra en la Fase 1

- Cuentas de usuario, inicio de sesión, y el selector de contexto (Especificación Maestra
  §7–8).
- Creación del espacio de Restavor y estructura de Grupos → Establecimientos (§2, §24–30).
- Los cuatro roles del proveedor (Propietario, Administrador, Trabajador) y los cuatro del
  restaurante (Propietario global, Propietario local, Editor, Consulta), con sus permisos
  aplicados en el servidor (§11–17, §167–169).
- El ciclo completo Solicitud → Trabajo → Tarea, con sus estados y estados calculados
  (como "Fuera de plazo") (§32–40).
- Clasificación de cambios por categoría y consumo del plan (§41–43).
- El reloj contractual de horas laborables y sus tres plazos (§44–47).
- La corrección mínima gratuita (§48) y las reglas de cancelación (§49).
- Asignación de trabajos a trabajadores — empezando por asignación **manual**; la
  recomendación automática (§51) puede simplificarse en el primer hito que la incluya y
  refinarse después, dado que la fórmula exacta está deliberadamente sin calibrar (§170.5).
- Mensajes básicos vinculados a una solicitud (§66.1, §67), respetando que el cliente solo
  ve "Equipo de mantenimiento".
- Notificaciones mínimas para los eventos anteriores (centro de avisos dentro de Cuotly y
  correo; push cuando la app móvil lo soporte).
- Auditoría básica de las acciones anteriores (quién, qué, cuándo) — no hace falta el panel
  de auditoría completo de §139, pero sí que quede registrado desde el principio.

### Explícitamente fuera de la Fase 1 (se planifican en fases posteriores)

- Finanzas y cobros (§80–88), planes y servicios configurables más allá del plan fijo de
  Restavor (§102–107).
- Menú Diario (§56–65).
- Informes, analítica y oportunidades (§89–101).
- Integraciones externas — GA4, Search Console, Business Profile, Clarity, PageSpeed
  (§115–122).
- Calendario avanzado más allá de lo estrictamente necesario para mostrar plazos (§75–79).
- Archivos avanzados (versiones, categorías finas) más allá de adjuntar un archivo a una
  solicitud (§108–114).
- Panel de Administración de Cuotly, Modo soporte, soporte al restaurante como módulo propio
  (§128–133).
- Todo lo de la sección 24 de este PRD (pendientes deliberados) y la sección 25 (fuera de
  alcance actual del producto completo).

Esta lista se revisa y se amplía a medida que cerramos cada fase — no es definitiva para
siempre, solo para la Fase 1.

## 9. Fases posteriores (solo nombradas, sin detallar)

Ver `docs/ROADMAP.md` para el desglose en hitos. A alto nivel, después de la Fase 1:

- **Fase 2**: Finanzas y planes/servicios configurables.
- **Fase 3**: Menú Diario.
- **Fase 4**: Informes, analítica e integraciones externas.
- **Fase 5**: El resto del producto completo (calendario avanzado, archivos avanzados,
  soporte, panel de Administración de Cuotly, seguridad avanzada, apertura a otros espacios
  de mantenimiento).

No se detallan todavía, siguiendo la regla de "no adelantar trabajo de fases posteriores".

## 10. Criterios de aceptación que aplican a cualquier hito

(Especificación Maestra §173–179, resumen)

- Ninguna función se considera terminada por ocultar un botón: hay que demostrar que un
  usuario sin permiso tampoco puede hacer la acción por la URL o la API directamente.
- No puede haber consumos duplicados; toda corrección manual se audita con motivo, autor,
  valor anterior y valor nuevo.
- Los contadores de tiempo deben ser reproducibles en el servidor, con pausas y
  reanudaciones trazables.
- Ningún panel muestra números inventados: si no hay datos, se dice explícitamente que no
  los hay.
- Las mismas entidades y estados se llaman igual en todos los sitios (web, móvil, correos,
  historial).

## 11. Glosario mínimo

- **Espacio (de mantenimiento)**: una empresa que usa Cuotly para gestionar su propio
  mantenimiento de restaurantes. Restavor es el primer espacio.
- **Grupo**: una empresa cliente que puede tener uno o varios establecimientos.
- **Establecimiento**: un restaurante concreto, con su propio plan y sus propios consumos.
- **Solicitud / Trabajo / Tarea**: ver sección 3 de este documento.
- **RLS (Row Level Security)**: un tipo de regla que se define en la propia base de datos
  y que impide que una consulta devuelva filas a las que el usuario que pregunta no tenga
  acceso, aunque el código de la aplicación tuviera un fallo. Es la barrera de seguridad
  "de última línea" para el aislamiento entre espacios.

---

# 24. Pendientes deliberados — NO decidir por tu cuenta

Estas cosas están **a propósito** sin definir. Si una tarea las toca, para y pregunta a
Bosco; no inventes una regla para rellenar el hueco. (Especificación Maestra §170.)

## 24.1 Legal

Prestador contractual exacto, términos de uso, privacidad, tratamiento de datos, contratos
entre espacios y restaurantes, validez de aceptaciones, retenciones legales, fiscalidad de
facturas, legislación y jurisdicción aplicable. Antes de cualquier lanzamiento real, esto
debe revisarlo un profesional cualificado — no Claude Code, no Bosco solo.

## 24.2 Agente Cuotly

Funciones, modelo de IA, herramientas, permisos, créditos, precios, límites de gasto y
automatizaciones del futuro asistente de IA. Por ahora solo existe como elemento visual con
la etiqueta "Próximamente" (Especificación Maestra §74) — no debe consumir IA de verdad ni
simular funcionalidad que no existe.

## 24.3 API y webhooks

Contemplados como posibilidad futura del plan Agency. No se desarrollan en ninguna fase
planificada todavía.

## 24.4 Almacenamiento adicional

Se admite como ampliación futura de espacio en disco, pero su precio no está fijado.

## 24.5 Fórmulas y umbrales por calibrar

- La fórmula exacta de recomendación automática de trabajador (§51) — hay una lista de
  factores a considerar, pero no una fórmula cerrada.
- La categoría de puntos de carga para tareas de más de 4 horas (§54.2).
- Los umbrales concretos que convierten un dato en "oportunidad de mejora" (§96).
- La definición operativa de "impacto" y "esfuerzo" de una oportunidad (§96).
- La sincronización bidireccional de calendarios externos (§79) — de momento solo sale de
  Cuotly hacia fuera.

---

# 25. Fuera de alcance actual (del producto completo, no solo de la Fase 1)

(Especificación Maestra §171 — lista completa; estas cosas no están planificadas en
ninguna fase todavía, ni siquiera como idea futura cercana)

Nóminas, contratos laborales, fichaje horario, recursos humanos, retoque fotográfico
avanzado, producción fotográfica, monitorización operativa de reservas o delivery,
automatización real de la publicación en LandingSite, chat privado cliente–trabajador,
vídeos como tipo de archivo, eliminación de mensajes, personalización de colores o marca
blanca, modo oscuro, publicidad, cobro automático con Stripe.
