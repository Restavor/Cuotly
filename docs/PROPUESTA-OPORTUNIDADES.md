# Propuesta · umbrales de oportunidades, impacto y esfuerzo

**Estado: confirmado entero por Bosco el 14/09/2026 y recogido como decisión 26 en
`docs/DECISIONES.md`, que es donde manda.** Este archivo se conserva porque explica **por qué**
cada número es ese, que la decisión resume; si los dos dicen cosas distintas, vale la decisión.
Las dos métricas del apartado 4 están añadidas y funcionando desde ese mismo día.

Lo que sigue es el texto tal como se le presentó, con un número concreto en cada sitio para que
cambiarlo fuera tachar y escribir otro. No cambió ninguno.

Escrito el 14/09/2026 a partir de §96 a §101 de la Especificación Maestra, que da los nueve
ejemplos de oportunidad y los campos de cada una, pero **no dice cuándo salta ninguna**.

---

## 1. Qué es "impacto" y por qué no son euros

Preguntaste a qué me refería. Impacto es **cuánto gana el restaurante si esto se arregla**, para
poder ordenar la lista: si hay seis oportunidades abiertas, cuál merece la pena primero.

Lo natural sería decirlo en euros ("esto te trae 300 € al mes"). **Propongo no hacerlo**, y el
motivo es el de siempre en este proyecto: no tenemos el dato. Cuotly no sabe lo que vale una
reserva ni cuántas visitas acaban en cena. Poner un euro ahí sería inventarlo, y un número
inventado en una pantalla de producción es justo lo que CLAUDE.md prohíbe.

**Propuesta: tres niveles, y cada uno definido por lo que toca el problema, no por una corazonada.**

| Nivel | Cuándo | Por qué |
|---|---|---|
| **Alto** | Rompe o estorba el camino por el que un cliente contacta: el teléfono, cómo llegar, la reserva, el formulario. O afecta a más de la mitad del tráfico del sitio. | Si nadie puede llamar, da igual todo lo demás. |
| **Medio** | Afecta a una parte visible del sitio o a una entrada de tráfico importante, pero no al camino de contacto. | Se pierde gente por el camino, pero quien llega puede contactar. |
| **Bajo** | Afecta a una página, una consulta o un detalle suelto. | Merece arreglarse, no corre prisa. |

El nivel lo **propone** Cuotly con esa regla y el equipo **lo puede cambiar** antes de enseñárselo
al restaurante: §96 dice que impacto, prioridad y esfuerzo son propuestas editables. Lo que no
cambia es la evidencia: los números que dispararon la oportunidad se guardan y se enseñan.

## 2. Qué es "esfuerzo": la categoría del cambio, sin escala nueva

Dijiste "lo que se tarda en hacer y los cambios que gasta". Eso ya existe en Cuotly y tiene
nombre: **la categoría del cambio**. Propongo usarla tal cual y no inventar una escala paralela.

| Esfuerzo | Se tarda (RN-SLA-12) | Gasta | En Impulso quedan | En Premium quedan |
|---|---|---|---:|---:|
| Pequeño | 1–3 días laborables | 1 pequeño | 16 al mes | 25 al mes |
| Fotográfico | 1–3 días laborables | 1 fotográfico | 12 | 24 |
| Mediano | 1–3 días laborables | 1 mediano | 3 | 5 |
| Grande | 3–5 días laborables | 1 grande | 0, va a presupuesto | 1 |

La ventaja de no inventar nada aquí es que la pantalla puede decir algo útil de verdad: no
"esfuerzo: medio", sino **"Mediano: 1 a 3 días laborables, y te gasta 1 de los 3 medianos que te
quedan este mes"**. Y en Básico, que no incluye ningún cambio, o cuando la bolsa está agotada, la
oportunidad dice que va a presupuesto en vez de fingir que está incluida.

## 3. Los nueve umbrales

Los nueve ejemplos son los de §96. Cada regla dice **con qué dato** se calcula, porque una regla
sobre un dato que no recogemos no serviría de nada.

Tres cosas valen para todas:

- **Ventana**: los 28 últimos días completos, comparados con los 28 anteriores, que es la ventana
  que ya usa "Informes y datos" (decisión 25b).
- **Suelo de ruido**: ninguna regla salta si no hay bastante dato. Un restaurante con 12 visitas
  al mes no tiene un "descenso significativo": tiene doce visitas. El suelo va en cada regla.
- **Fuente viva**: nada salta si su integración está desconectada, sin autorizar o con el dato
  desactualizado. Se dice el motivo, como en el resto de las pantallas (P6).

| # | Oportunidad | Se calcula con | Salta cuando propongo |
|---|---|---|---|
| 1 | Descenso de tráfico | GA4 `sessions` | Caen **un 30 % o más** frente a los 28 días anteriores, y el periodo anterior tenía **al menos 100 sesiones**. |
| 2 | CTR bajo | Search Console `ctr`, `position`, por consulta | Una consulta con **100 impresiones o más** que está en **posición 10 o mejor** y aun así tiene un **CTR por debajo del 2 %**. Está en la primera página y nadie entra: el problema es el título o la descripción. |
| 3 | Pérdida de posición | Search Console `position`, por consulta | Una consulta con **50 impresiones o más** que **empeora 3 puestos o más** y acaba **por debajo del 10**. Caer del 2 al 5 no saca a nadie de la primera página; caer del 8 al 14 sí. |
| 4 | Lentitud | PageSpeed `performance_score_by_strategy`, `lcp_ms_by_strategy` | La puntuación **móvil baja de 50** (la banda roja de Lighthouse, decisión 25h) o el **LCP móvil pasa de 4 segundos**, en **dos análisis seguidos**. Dos, para que un mal día no genere trabajo. |
| 5 | Imágenes pesadas | **Falta el dato.** Ver el apartado 4. | — |
| 6 | Error técnico | Clarity `script_errors` | Hay errores de script en **el 5 % o más de las sesiones**, con **100 sesiones o más** en la ventana. |
| 7 | Baja conversión móvil | **Falta el dato.** Ver el apartado 4. | — |
| 8 | Búsquedas sin contenido adecuado | Search Console `impressions`, `position`, por consulta | Una consulta con **100 impresiones o más** cuya posición media es **peor que 20**. Google cree que el sitio va de eso y lo enseña muy abajo. Ojo: esto detecta "sale muy abajo", no "el contenido no es adecuado". Juzgar el contenido exigiría leer la web, y Cuotly no la lee. |
| 9 | Poco uso de botones importantes | Business Profile `profile_impressions`, `website_clicks`, `call_clicks`, `direction_requests`; Clarity `dead_clicks`, `rage_clicks` | Dos casos distintos. **(a)** La ficha de Google tiene **500 impresiones o más** y las acciones (web, llamada, cómo llegar) suman **menos del 2 %**: la ven y no hacen nada. **(b)** Los clics muertos o de rabia pasan del **5 % de las sesiones**: pulsan algo que no responde. |

## 4. Dos de los nueve no se pueden calcular hoy

Esto es lo más importante de la propuesta y por eso va aparte. Dos de los nueve ejemplos de §96
**no se pueden detectar con lo que Cuotly recoge**, y prefiero decirlo antes que escribir un
umbral que nunca saltaría.

**Imágenes pesadas (5).** De PageSpeed guardamos la puntuación y las métricas de laboratorio
(LCP, INP, CLS, TBT, FCP, Speed Index). PageSpeed **sí** dice cuántos kilobytes se ahorrarían
redimensionando o recomprimiendo las imágenes, pero eso está en sus auditorías de detalle, que no
guardamos. Para que la regla exista hay que añadir dos auditorías al catálogo:
`uses-optimized-images` y `uses-responsive-images`, ambas en kilobytes ahorrables. Con eso, la
regla sería: **500 KB o más ahorrables en móvil**. Es la mitad de lo que pesa una página normal
de restaurante, así que no es un detalle.

**Baja conversión móvil (7).** Guardamos las sesiones por dispositivo y las conversiones por
evento, pero **no las conversiones por dispositivo**, así que no se puede comparar cuánto convierte
el móvil frente al escritorio: es exactamente el dato que falta. Habría que añadir
`conversions_by_device` a GA4. Con eso, la regla sería: **el móvil convierte la mitad o menos que
el escritorio**, con al menos 100 sesiones móviles en la ventana.

Las dos cosas son añadir métricas al catálogo, que es una lista que **acabas de confirmar** como
decisión 25c. Por eso no las he tocado: dime si las añado y la decisión 25 se amplía, o si
prefieres que esas dos oportunidades no existan de momento y la lista se quede en siete.

## 5. Lo que ya dice la maestra y no hace falta decidir

Para que se vea qué parte del Hito 15 no depende de esto:

- Una oportunidad enseña título, categoría, evidencia, periodo, prioridad propuesta, impacto,
  esfuerzo, acción recomendada, el servicio o cambio que resolvería, y si se incluye en el
  informe (§96).
- **Se detectan solas pero no se enseñan solas**: hasta que el equipo no aprueba una, el
  restaurante no la ve (§295, §1806).
- Una detección repetida **actualiza la que ya existe**, no crea otra (§99).
- El equipo puede añadirlas a mano (§97) y el restaurante puede actuar sobre ellas (§100).
- Qué ve cada plan: Básico ninguna, Impulso las básicas aprobadas, Premium las avanzadas (§101).
  "Básica" y "avanzada" tampoco están definidas en la maestra; si las nueve reglas te parecen
  bien, propongo que **avanzadas** sean las que cruzan dos fuentes y **básicas** las que salen de
  una sola, pero es otra decisión tuya.

---

## Lo que necesito de ti

1. Los números de la tabla del apartado 3: confírmalos o cámbialos. Son ocho números.
2. Si añado las dos métricas del apartado 4 o dejo las oportunidades en siete.
3. Si impacto son los tres niveles del apartado 1 o prefieres otra cosa.
4. Si esfuerzo es la categoría del cambio, como propongo en el apartado 2.
5. Lo de básicas y avanzadas del apartado 5, que puede esperar al final del hito.
