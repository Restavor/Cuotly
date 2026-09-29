# Maqueta de referencia · Restavor app y Restavor agents › Reservas

Los archivos `*.dc.html` son maquetas hechas con un motor de diseño propio (usan `{{...}}`, `<sc-for>`, `<sc-if>` y un `support.js` que no está aquí). **No se abren tal cual ni se copian como código.** Léelos para copiar estructura, textos, orden, tamaños y colores. El aspecto se construye con Emerald Control del repositorio (`tokens.css`, `components/ui/`).

Hojas de estilo que citan las maquetas:
- `/_blob/ec82e4b18abdc55e9f024989d4a8779f` = `emerald-maqueta.css` (la usan las de `final/`).
- `/_blob/e08822f82e80488a7044f07bb63578aa` = `sobremesa-antiguo.css` (la usan algunas de `estructura/`).

`capturas/`: imágenes PNG exportadas del lienzo por Bosco (si las ha metido), sin renombrar: empareja cada una con su pantalla y apunta la equivalencia en `capturas/LEEME.txt`. Úsalas para comparar tus capturas de Playwright.

Los textos de las maquetas son los definitivos salvo los cambios de PRD §12.3.

## `final/` · diseño definitivo (aspecto y contenido)
| Archivo | Pantalla | Tamaño |
|---|---|---|
| `AppInicio` | Restavor app · Inicio (cliente con web y agents) | 1440×900 |
| `AppInicioSoloWeb` | Restavor app · Inicio (solo web, "Contratar Reservas") | 1440×900 |
| `AppContratar` | Contratar Reservas (ventana) | 1440×900 |
| `AppInicioMovil` | Restavor app · Inicio (móvil) | 390×1000 |
| `AgentsHoy` | Reservas · Hoy (tablet), con el indicador del agente | 1180×820 |
| `AgentsHoyMovil` | Reservas · Hoy (móvil), barra inferior | 390×1000 |
| `AgentsAgente` | Agente de llamadas · tarjeta encender/apagar + Llamadas (interactiva: prueba "Apagar agente") | 1180×820 |
| `AgentsEncenderApagar` | Hoja: estados encendido/apagado, ventana "¿Hasta cuándo?", indicador y reglas | 1180×800 |
| `AgentsAgenteMovil` | Agente de llamadas (móvil) | 390×1060 |
| `AgentsInfo` | Agente de llamadas · Información (tablet) | 1180×1320 |
| `AgentsInfoMovil` | Agente de llamadas · Información (móvil) | 390×2000 |
| `AgentsSaldo` | Saldo y recarga (tablet) | 1180×820 |
| `AgentsMasMovil` | Más (móvil) | 390×900 |
| `AppInicioEstados` | Restavor app · Inicio sin nada activo: solicitud enviada, no aprobada, nada contratado (interactiva: arriba se cambia de caso) | 1440×960 |
| `AppCambiarProducto` | Menú del logo para cambiar de producto (igual en Restavor web y Restavor agents; interactiva) | 1180×880 |
| `AgentsCondiciones` | Aceptar las condiciones de Reservas (interactiva: la casilla activa el botón) | 1180×820 |
| `AgentsPendientePago` | Aprobado: datos para pagar el primer mes | 1180×820 |

En las cuatro últimas, la franja "Maqueta · …" de arriba es solo para probar los casos: no forma parte de la pantalla. Los textos entre corchetes (IBAN, Bizum, texto legal) los aporta Bosco.

## `estructura/` · valen por contenido, textos y orden (aplicar Emerald Control)
Tienen el aspecto antiguo (verde salvia, letra Figtree): **no copies sus colores ni su letra**, salvo los colores de orígenes y de "Pendiente" del PRD §12.2 (ojo: en estas maquetas el origen Web aún sale en verde azulado; el bueno es el rosa del PRD).

| Archivo | Pantalla | Notas |
|---|---|---|
| `Calendario`, `CalendarioMovil` | Calendario del mes | El menú de estas maquetas es el antiguo; usa el de `final/` |
| `Buscar` | Buscar reserva | |
| `PinTablet` | ¿Quién eres? + PIN | |
| `NuevaReserva` | Nueva reserva | |
| `Ficha`, `CancelarReserva` | Ficha y cancelar | |
| `EditarReserva` | Editar reserva de plataforma | |
| `Ajustes` | Horarios, turnos y aforo | |
| `AjustesEquipo` | Equipo y dispositivos | |
| `AjustesConexiones` | Conexiones | La parte del agente ya está en Agente de llamadas |
| `AjustesPlan` | Plan y pagos | **Sin plan anual**; el saldo está en Saldo |
| `PrimerUso` | Primer uso (paso de días y turnos) | Pasos: días y turnos → aforo y grupos → equipo y tablet → agente |
| `CuentaCerrada` | Reservas cerrada | "[Nombre de la app]" = "Restavor" |
| `HojaAvisos`, `HojaReservas` | Barras de aviso y estados de filas | |
| `AgenteHorarioMovil` | Horario del agente y teléfono para pasar llamadas | El interruptor de arriba es el de `AgentsAgente` |
| `AgenteEditarRespuesta` | Editar una pregunta frecuente | |
| `AgenteSaldoMovil` | Saldo (móvil) | Contenido de Saldo en móvil |
| `WidgetWeb`, `WidgetHecha`, `WidgetSinSitio` | Formulario web | "[Nombre de la app]" = "Restavor" |
| `CancelarCliente` | Enlace del cliente para cancelar | |
| `EmailConfirmacion`, `WhatsAppConfirmacion` | Avisos | Mandan los textos de `textos-avisos.md` |
| `PanelSolicitudes`, `PanelRestaurante`, `PanelErrores`, `PanelCobros` | Lado de Restavor | Solo como **referencia de contenido**: se integra en el espacio Restavor (PRD §11.2). Precios del anual: no aplican |

## Datos de las maquetas
Son los del sembrado (PRD §16): Casa Pepe, sábado 26/09/2026 a las 14:10.
