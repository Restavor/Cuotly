# Cuotly — ROADMAP

Este documento fija el **orden** de trabajo: primero las fases, y dentro de la Fase 1, los
hitos. No se empieza un hito sin haber cerrado (con visto bueno de Bosco) el anterior, y no
se detalla un hito futuro hasta que le toque — para no invertir tiempo de planificación en
algo que puede cambiar antes de llegar ahí.

Para el "qué" y el "por qué" de cada fase, ver `docs/PRD.md`. Este documento es solo el
"en qué orden y con qué evidencia de que funciona".

---

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1** | Núcleo operativo mínimo (web y móvil en paralelo) | **En curso** — ver hitos abajo |
| Fase 2 | Finanzas y planes/servicios configurables | Sin detallar |
| Fase 3 | Menú Diario | Sin detallar |
| Fase 4 | Informes, analítica e integraciones externas | Sin detallar |
| Fase 5 | Resto del producto completo (calendario avanzado, archivos avanzados, soporte, administración de Cuotly, seguridad avanzada, apertura a otros espacios) | Sin detallar |

Las fases 2 a 5 solo tienen nombre y una frase de contenido por ahora. Se detallan en
hitos cuando la Fase 1 esté cerrada y aprobada, salvo que aparezca antes una razón de peso
para adelantar la planificación de una — y en ese caso, se para y se pregunta a Bosco, no
se decide en solitario.

---

## Fase 1 — Núcleo operativo mínimo

Objetivo de la fase: que Bosco pueda, de principio a fin y en web y en móvil, crear su
espacio (Restavor), dar de alta un restaurante, invitar a alguien de su equipo con un rol
concreto, recibir una solicitud de ese restaurante, convertirla en un trabajo, asignarlo,
ejecutarlo y publicarlo — con los plazos, los permisos y el aislamiento entre empresas
funcionando de verdad, no simulados.

### Hitos

| Hito | Nombre | Objetivo resumido | Detalle |
|---|---|---|---|
| **H1** | Cimientos técnicos | Repositorio, entornos, base de datos y autenticación funcionando; una persona puede registrarse e iniciar sesión en web y en móvil, sin funcionalidad de negocio todavía | ✅ **Cerrado** (29/08/2026) — `docs/PLAN-H1-H2.md` |
| **H2** | Identidad multiempresa | Modelo de datos de Espacios/Grupos/Establecimientos, roles básicos y aislamiento entre espacios (RLS) reales; Bosco puede crear el espacio de Restavor, dar de alta un establecimiento e invitar a alguien con un rol, en web y en móvil | **En curso** — `docs/PLAN-H1-H2.md` |
| H3 | Ciclo Solicitud → Trabajo → Tarea (estados) | El flujo completo de estados de §32–40, sin relojes de tiempo todavía | Se detalla al llegar |
| H4 | Reloj contractual y plazos | Los tres relojes de tiempo (§44–47) aplicados al ciclo del H3, con sus avisos | Se detalla al llegar |
| H5 | Clasificación, consumos y corrección mínima | Categorías de cambio, consumo del plan y corrección gratuita (§41–43, §48–49) | Se detalla al llegar |
| H6 | Asignación de trabajadores | Asignación manual primero; versión simplificada de la recomendación automática (§51) | Se detalla al llegar |
| H7 | Mensajes básicos | Conversación vinculada a una solicitud, con la regla de "Equipo de mantenimiento" (§66.1, §67) | Se detalla al llegar |
| H8 | Notificaciones mínimas y auditoría básica | Avisos de los eventos anteriores (centro de avisos, correo, push) y registro de quién-qué-cuándo | Se detalla al llegar |

**Notas de cierre del H1** (aprobado por Bosco el 29/08/2026): el diseño visual real
("Emerald Control") se aplicó a las pantallas de login/registro de la web a partir de una
referencia que compartió Bosco; la app móvil todavía tiene esas mismas pantallas sin
diseño, pendiente de aplicarlo en un momento posterior. La confirmación en vivo de que el
registro funciona contra el proyecto real de Supabase quedó pendiente de verificar (el
entorno de esta sesión bloquea la conexión directa a Supabase); se retoma en el H2.

Esta lista de H3 en adelante es una **propuesta de orden**, no un compromiso cerrado: puede
reordenarse o dividirse de otra forma cuando lleguemos ahí, según lo que aprendamos en H1 y
H2. Lo que no cambia es que ningún hito de esta lista empieza sin que el anterior esté
aprobado por Bosco con evidencia.

### Qué significa "cerrar un hito" en esta fase

Para cada hito, antes de pedir el visto bueno de Bosco, tiene que poder enseñarse:

1. Los tests automáticos relacionados con ese hito, en verde, con su salida real (no un
   resumen inventado).
2. Una demostración de que funciona: en hitos con interfaz, capturas de pantalla o un
   recorrido guiado de la pantalla real (web y móvil, cuando aplique); en hitos sin
   interfaz (como H1), evidencia de que el sistema hace lo que decía que haría (por
   ejemplo, un usuario nuevo consigue registrarse e iniciar sesión de verdad).
3. Confirmación explícita de que las reglas de seguridad de ese hito se cumplen (por
   ejemplo, desde H2: que un usuario de un espacio no puede ver datos de otro espacio,
   probado intentándolo, no solo asumiéndolo).
