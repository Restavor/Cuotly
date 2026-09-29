# Cómo construir Restavor app y Restavor agents › Reservas con Claude Code

Para Bosco. Esta vez no es una app nueva: se construye **dentro del proyecto de Restavor web**, con el mismo Claude Code que lo ha hecho hasta ahora. Tú das las instrucciones, compruebas el resultado y decides.

**Una idea importante:** hoy, cada vez que Claude Code sube algo a la rama de Restavor web, se publica al momento en la web de verdad. Para no romper nada, todo lo nuevo se hace en una **rama aparte** (`agents`) con su propia **copia de pruebas** (una dirección de Vercel de vista previa y una base de datos de pruebas en Supabase). Lo pruebas ahí con datos inventados. A producción solo pasa cuando tú lo digas.

---

## Qué hay en este kit
| Archivo | Para qué sirve |
|---|---|
| `docs/agents/PRD-RESTAVOR-AGENTS.md` | Todo lo que hay que construir: la puerta común, Restavor agents y Reservas con el agente de llamadas |
| `docs/agents/INSTRUCCIONES-PARA-CLAUDE.md` | Las normas de trabajo para esta ampliación (se suman a las que ya tiene Restavor web) |
| `docs/agents/diseno/` | Las pantallas de la maqueta: `final/` (aspecto definitivo) y `estructura/` (valen por su contenido) |
| `docs/agents/textos-avisos.md` | Los textos de los emails, WhatsApp y SMS a los comensales. Revísalos |
| `docs/agents/guia-conectar-agente.md` | Cómo conectarás tu agente de llamadas cuando toque |

## Antes de empezar (una vez)
1. **Termina antes lo que tengas a medias de Restavor web** y súbelo como siempre, **sin tocar** el acceso, los usuarios, los cobros, el panel ni el menú, que es lo que cambia en la Fase A.
2. **Mete el kit en el proyecto**: abre el chat de Claude Code de Restavor web, adjunta el zip y pega:
   > Te adjunto el kit de la ampliación "Restavor app y Restavor agents". Crea una rama nueva llamada `agents` a partir de la rama de trabajo actual y cámbiate a ella. Descomprime el kit en la raíz del repositorio: tiene que quedar la carpeta `docs/agents/` con todo dentro. No cambies nada más. Súbelo a la rama `agents` en un commit "Kit de Restavor agents" (no a la rama de producción) y dime qué archivos has añadido.
3. **Imágenes de la maqueta** (opcional, ayuda a que quede igual): en el lienzo, Compartir › Exportar, formato PNG, **todas las páginas**. Adjúntalas en ese mismo chat, sin renombrarlas, y pega: "Guárdalas en `docs/agents/diseno/capturas/` y súbelas a la rama `agents`". Si no puedes, sigue igual: Claude Code también usa los archivos de diseño.
4. Las cuentas de Stripe, WhatsApp (Meta), SMS y Cloudflare no hacen falta hasta las fases E, F y H. Claude Code te avisará cuando toque y te dirá qué clave necesita y dónde pegarla.
5. Si mientras se construye esto arreglas algo en Restavor web, díselo a Claude Code al empezar la siguiente fase: "Trae a la rama `agents` los cambios nuevos de la rama de trabajo".

## Cómo es cada fase (siempre igual)
1. **Conversación nueva** de Claude Code para cada fase (así empieza limpio).
2. Pega el mensaje de la fase (abajo). Te propondrá un plan: léelo y, si algo no te cuadra, díselo con tus palabras. Cuando esté bien, apruébalo.
3. Deja que trabaje. Acepta los permisos que sean del proyecto.
4. **Comprueba en la copia de pruebas**: al final te dejará en `docs/ROADMAP.md` unos "pasos para que Bosco lo pruebe a mano" (qué dirección abrir y con qué usuario). Hazlos. Si algo no está como en la maqueta o no funciona, díselo: "En la pantalla X, al pulsar Y pasa Z y debería pasar W".
5. **Guarda**: "Haz commit de la fase, súbelo a la rama `agents` y aplica sus migraciones a Restavor pruebas". Nunca a producción.

Si se atasca dos veces en lo mismo: conversación nueva y vuelve a pedírselo explicando lo que ya sabes que falla.

---

## Los mensajes de cada fase (copiar y pegar)

**Fase 0 · Copia de pruebas**
> Vamos a construir la ampliación descrita en `docs/agents/PRD-RESTAVOR-AGENTS.md`, siguiendo `CLAUDE.md` y `docs/agents/INSTRUCCIONES-PARA-CLAUDE.md`. Lee el PRD entero una vez para entender el conjunto y mira `docs/agents/diseno/README.md`. Empezamos por la **Fase 0** (PRD §15): la rama `agents` y la copia de pruebas (Vercel vista previa + un proyecto de Supabase "Restavor pruebas" con todas las migraciones y los datos de ejemplo). Explícame paso a paso y en sencillo lo que tengo que hacer yo (crear el proyecto de Supabase, pegar variables en Vercel) y compruébalo después. Nada de esto puede tocar producción.

**Fase A · Restavor app (la puerta común)**
> Seguimos con la **Fase A** del PRD de `docs/agents/` ("Restavor app"). Revisa en `docs/ROADMAP.md` cómo quedó la Fase 0. Lee §2, §4, §8.1, §8.2 y §15. Lo primero es APP-01: escribir las decisiones D-A a D-K en `docs/DECISIONES.md` y actualizar `CLAUDE.md`. Propón un plan detallado solo de la Fase A (qué cambia en rutas, navegación, marca, base de datos y tests) y explícamelo en lenguaje sencillo. Si algo choca con lo que ya existe, pregúntame. No empieces a programar hasta que apruebe el plan.

**Fase B · Cimientos de Restavor agents**
> Seguimos con la **Fase B** del PRD de `docs/agents/`. Revisa en `docs/ROADMAP.md` cómo quedó la Fase A. Lee §3, §5.1, §6.13, §8, §12 y §16. Propón el plan (migraciones, permisos, armazón, componentes, sembrado y tests) y, cuando lo apruebe, constrúyelo con la Definición de hecho de §15.0.

**Fase C · La agenda**
> Seguimos con la **Fase C** ("La agenda"). Revisa el ROADMAP. Lee §6 y §11.1 y las pantallas de `docs/agents/diseno/` que se citan. Propón el plan y, cuando lo apruebe, constrúyelo, pasa todas las pruebas, haz capturas, compáralas con la maqueta y termina con los pasos para que yo lo pruebe.

**Fase D · Equipo con PIN, tablet del local y soporte**
> Seguimos con la **Fase D**. Revisa el ROADMAP. Lee §3 entero y la Fase D. Propón el plan y, cuando lo apruebe, constrúyelo con la Definición de hecho.

**Fase E · Contratación, cobro y saldo**
> Seguimos con la **Fase E**. Revisa el ROADMAP. Lee §2 (D-D, D-G), §4.4, §5.2, §6.12, §8.6, §9.4, §10.5 y §11.2. Todo lo de Stripe en modo de pruebas. Propón el plan y, cuando lo apruebe, constrúyelo. Dime paso a paso qué tengo que hacer en Stripe para activarlo de verdad.

**Fase F · Avisos a los comensales**
> Seguimos con la **Fase F**. Revisa el ROADMAP. Lee §5.2, §6.11, §6.13, §8.6, §10.3, §10.4 y `docs/agents/textos-avisos.md`. Primero todo con el proveedor falso de mensajes. Después dime paso a paso qué tengo que hacer en Meta (WhatsApp), en el proveedor de SMS y en Resend.

**Fase G · Agente de llamadas**
> Seguimos con la **Fase G** ("Agente de llamadas"). Revisa el ROADMAP. Lee §5.2, §7, §8.5, §9.1, §10.1 y `docs/agents/guia-conectar-agente.md`. Todo se prueba con el agente falso: todavía no conectamos mi agente real. Al terminar, actualiza la guía con ejemplos reales para que yo lo conecte en ElevenLabs y n8n.

**Fase H · Formulario web**
> Seguimos con la **Fase H**. Revisa el ROADMAP. Lee §9.2 y §11.4. Propón el plan y, cuando lo apruebe, constrúyelo. Dime qué tengo que hacer en Cloudflare para el filtro antibots.

**Fase I · Plataformas de reservas**
> Seguimos con la **Fase I**. Revisa el ROADMAP. Lee §10.2. Construye la interfaz de conectores y el conector de prueba "demo". No construyas conectores reales hasta que te dé su documentación.

**Fase J · App instalable, sin conexión y pulido**
> Seguimos con la **Fase J**. Revisa el ROADMAP. Lee §6.14, §13 y la Fase J. Al final revisa todas las pantallas contra `docs/agents/diseno/` y dame una lista de las diferencias que queden.

**Cuando conectes tu agente real**
> Voy a conectar mi agente de llamadas (te explico cuál es y cómo informa de cada llamada y su coste). Crea su conector siguiendo §10.1 del PRD de `docs/agents/`, con sus tests, sin tocar el resto. Dime qué tengo que configurar en mi agente.

**Cuando consigas la API de una plataforma real**
> Tengo la documentación de la API de <plataforma> (te la adjunto). Crea su conector siguiendo §10.2 del PRD de `docs/agents/`, con sus tests, sin tocar el resto. Dime qué datos necesitas que ponga en la ficha del restaurante para conectarla.

**Cuando quieras publicarlo (pasar a producción)**
> Quiero publicar en producción lo que está en la rama `agents`. Antes, dime qué migraciones se van a aplicar al proyecto real, qué cambia para los clientes de Restavor web y cómo volver atrás si algo sale mal. Espera mi "adelante" antes de tocar nada.

---

## Antes de abrirlo a restaurantes de verdad
- `app.restavor.com` funcionando y el dominio `restavor.com` verificado en Resend.
- Bloque legal hecho: textos de privacidad, condiciones de Reservas y encargado del tratamiento revisados por un profesional.
- WhatsApp verificado en Meta con plantillas aprobadas; alias "Restavor" de SMS registrado en la CNMC.
- Stripe en modo real.
- Tu agente conectado y probado con un restaurante amigo durante una semana.
- Vercel en plan Pro.
