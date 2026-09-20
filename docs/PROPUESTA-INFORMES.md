# Propuesta · Los cinco niveles de informe y qué se ve al abrirlo

Escrito el 20/09/2026, después de que Bosco contestara tres cosas sobre los
informes.

> **Estado, 20/09/2026.** Bosco confirmó el reparto de los cinco niveles, que
> "Lo que ha pasado este mes" va en **todos** con distinto detalle, y que un
> informe con Finanzas **no lo ve** quien no tenga ese permiso. Eso se
> construyó como **decisión 56** (migración 111, RN-REP-15/16): la columna, el
> reparto, la barrera y la visibilidad.
>
> **Lo que sigue pendiente de construir** es el apartado 3 de este documento
> —"Lo que ha pasado este mes"—, la **comparación con el periodo anterior** y
> el **PDF** de la maqueta.

Lo que Bosco ya ha dicho, literal, y que aquí no se discute:

- **Cinco niveles, uno por plan**: *"básico [tiene] un informe básico,
  Impulso tiene un informe estándar, Impulso+ tiene un informe estándar+,
  Premium un informe avanzado y Premium+ tiene un informe completo en el que
  está detallado todo"*.
- **Las dos cosas a la vez**: más informes **y** más profundidad.
- **La comparación con el periodo anterior, en todas las cifras.**
- **El informe tiene que ser "un resumen de todo lo que ha pasado en el
  mes"**, no solo un cuadro de métricas.
- De la maqueta del PDF: *"está perfecto, pero hay que añadir cosas"*.

---

## 1 · El modelo de datos: un atributo del plan, no una regla por nombre

La página **97** del diseño ("Versiones de plan") enseña "Informes" en la
comparativa de versiones, junto a "Prioridad" y a los cambios incluidos, y
una de las líneas del resumen de cambios dice *"Se mejora el nivel de
informes a Avanzado"*. Es decir: **el nivel de informe es un atributo del
plan y se versiona como los demás**.

Así que va donde van los demás: una columna en `plans`.

```
plans.report_level  -- 'basic' | 'standard' | 'standard_plus' | 'advanced' | 'complete'
```

**No se decide por el nombre del plan.** Cuotly es multiempresa: otro
espacio llamará "Total" al suyo y elegirá qué nivel le pone. Lo que sigue es
el reparto **de Restavor**, que es un dato de producto como los precios:

| Plan | Nivel |
|---|---|
| Básico (99 €) | `basic` |
| Impulso (299 €) | `standard` |
| Impulso+ (399 €) | `standard_plus` |
| Premium (499 €) | `advanced` |
| Premium+ (599 €) | `complete` |

---

## 2 · Qué lleva cada nivel

Cada nivel **añade** a lo del anterior; ninguno quita. Todo lo de abajo sale
de secciones y métricas que **ya existen**, salvo lo que va marcado como
NUEVO.

### `basic` — Básico

- **Resumen ejecutivo** (lo escribe una persona).
- **Lo esencial**: tres cifras de cabecera del mes.
- **Lo que ha pasado este mes** *(NUEVO)*: la lista de lo ocurrido —menús
  publicados, cambios pedidos si los hubo, incidencias abiertas y cerradas—.
- Sin comparación con el mes anterior. Sin Rendimiento digital. Sin anexos.

**Por qué tan corto:** Básico **no incluye ningún cambio** (RN-COM-01), así
que su mes tiene poco que contar. Un informe de seis páginas lleno de "no
conectado" sería peor que uno de una página que dice lo que hay.

### `standard` — Impulso

Lo anterior, y además:

- **Operación completa**: solicitudes recibidas, aceptadas, rechazadas y
  canceladas; trabajos iniciados, completados y pendientes; cumplimiento de
  inicio y de ejecución; correcciones; consumo del plan; Menú Diario.
- **Comparación con el mes anterior** en las cifras de cabecera.

### `standard_plus` — Impulso+

Lo anterior, y además:

- **Rendimiento digital** con sus cifras de cabecera: sesiones, clics desde
  Google, clics a la web y llamadas.
- **Comparación con el mes anterior en TODAS las cifras**, no solo en las de
  cabecera.

### `advanced` — Premium

Lo anterior, y además:

- **Desgloses** en Rendimiento digital: por fuente y por dimensión —qué
  consultas, qué páginas, qué dispositivo—.
- **Oportunidades**: las aprobadas, ordenadas por impacto, con su esfuerzo.
- **Anexos y evidencias**: la ficha técnica de cada fuente —estado y hasta
  qué fecha llega su dato—, que es donde van los peros.
- **Finanzas**: sus cobros, lo cobrado y lo pendiente.

### `complete` — Premium+

Lo anterior, y además:

- **Todas las métricas** de las tres familias, sin recorte.
- **Evolución dentro del periodo**: las barras de comparación en cada cifra
  clave, no solo el porcentaje.
- **Detalle cambio a cambio** *(NUEVO)*: cada solicitud del mes con su
  estado, su plazo y si se cumplió.
- **Evidencias de publicación** *(NUEVO en el informe; el dato existe desde
  la migración 60)*: el enlace o la captura de lo publicado.

---

## 3 · "Un resumen de todo lo que ha pasado en el mes"

Hoy el informe es **un cuadro de métricas de una familia**: se elige
categoría (operación, finanzas o digital) y se marcan secciones. Lo que pide
Bosco es otra cosa: que el informe **cuente el mes**.

Eso pide una sección que no existe, **"Lo que ha pasado este mes"**, y que
sería una lista agrupada de hechos con su fecha:

- Los **cambios**: qué se pidió, qué se entregó y cuándo.
- El **Menú Diario**: qué se publicó y cuántas actualizaciones se gastaron.
- Las **incidencias**: abiertas y cerradas.
- Los **pagos**: cobros emitidos y registrados.
- Los **archivos** compartidos con el restaurante.

Todo eso ya está en la base —`requests`, `jobs`, `menus`, `incidents`,
`charges`, `files`— con su fecha y su estado. **No hace falta dato nuevo:
hace falta leerlo y ordenarlo por fecha.**

**Lo que hay que decidir aquí:** si esa sección va en todos los niveles (yo
diría que sí, y que lo que cambia es el detalle: en `basic` una línea por
cosa, en `complete` con su plazo y su evidencia) o solo a partir de alguno.

---

## 4 · Lo que cuesta cada parte

| Parte | Coste | Migración |
|---|---|---|
| `plans.report_level` y el reparto de Restavor | pequeño | sí |
| Que el informe respete el nivel al prepararse | mediano | sí (la función que prepara el borrador) |
| Comparación con el periodo anterior | mediano | **no**: las funciones de datos ya reciben "desde/hasta", así que es llamarlas dos veces |
| El PDF de la maqueta | mediano | no |
| Sección "Lo que ha pasado este mes" | **el más grande** | sí |
| Detalle cambio a cambio y evidencias | mediano | no, si la sección anterior ya está |

---

## 5 · Lo que estaba sin decidir, y cómo quedó

1. ~~**La sección "Lo que ha pasado este mes": ¿en todos los niveles o desde
   uno?**~~ — **en todos**, cambiando el detalle (Bosco, 20/09/2026).
2. ~~**Si lleva los pagos**~~ — los lleva, y quien no tenga "Pagos y facturas"
   **no ve ese informe**, no lo ve recortado (RN-REP-16).
3. ~~**El reparto de arriba, nivel a nivel**~~ — confirmado tal cual.
4. **Qué pasa con un informe ya enviado si el plan cambia después.** Lo
   coherente con RN-REP-12 —la versión es el original— es que **no cambie**:
   se envió con el nivel que había. Está escrito así en RN-REP-15, pero sigue
   siendo una lectura y no una respuesta de Bosco.
