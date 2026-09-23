# Propuesta · crear, editar y archivar planes y servicios (§102–104)

**Estado: pendiente de que Bosco decida.** Nada de esto está programado. Las pantallas de Planes y
servicios (M21, M53–M56) se hicieron el 23/09/2026 **sin** crear, editar ni archivar planes, por
decisión suya de ese día: primero las pantallas, la edición cuando estén fijadas las reglas. Cuando
las fije, se recogen como decisión en `docs/DECISIONES.md` y como reglas `RN-` en el PRD, y solo
entonces se programa.

## De dónde sale

La especificación maestra lo pide en tres apartados cortos:

- **§102** · solo el propietario crea, modifica o archiva planes; los administradores asignan los
  que existen.
- **§103** · los campos de un plan: nombre, descripción, precio, impuesto, periodicidad,
  permanencia, consumos por categoría, fotografías, plazo de inicio, prioridad, servicios
  incluidos, condiciones, límites y acceso a informes.
- **§104** · editar un plan **contratado** crea una versión nueva; la anterior puede archivarse
  para altas nuevas; los clientes pasan en su siguiente renovación o en una fecha programada; los
  cambios generales se avisan con **30 días naturales** como mínimo; se conserva la versión
  aceptada; y si el cambio importante requiere aceptación, Cuotly la pide.

El PRD no tiene todavía ninguna regla `RN-` para esto. Hoy Cuotly versiona **solo el texto de las
condiciones** (RN-DAT-07, migración 75): el precio, las cuotas, los plazos y el nivel de informe
viven en la fila del plan y no tienen versión. Por eso no se pueden editar desde la aplicación:
cambiar la fila cambiaría el contrato de todos los restaurantes que ya lo tienen, sin aviso y sin
aceptación.

Cada punto de abajo trae una propuesta concreta para que decidir sea tachar y escribir otra cosa.

---

## 1. Qué cuenta como "editar el plan"

**Propuesta:** crea versión nueva cualquier cambio en lo que el restaurante contrata: precio,
cuotas incluidas, plazos de inicio y de realización, si ordena sus solicitudes, nivel de informe,
vigilancia de reseñas y lo que concede `grants_priority`. **No** crea versión corregir el nombre o
la descripción comercial: no cambian lo que se presta, y el historial ya los guarda en la auditoría.

## 2. Un plan que no tiene nadie

**Propuesta:** se edita en el sitio, sin versión nueva, con apunte de auditoría (valor anterior y
nuevo). §104 habla solo del plan **contratado**; versionar uno que nadie tiene no protege a nadie.

## 3. Cuándo pasan a la versión nueva los que ya la tienen

**Propuesta:** en su **primera renovación que caiga al menos 30 días naturales después de
publicarla**. Quien renueva dentro de esos 30 días renueva todavía con la anterior y pasa en la
siguiente. Así se cumple el aviso mínimo de §104 sin que el propietario elija fechas a mano.

## 4. ¿Hace falta que el restaurante lo acepte?

Hay que distinguir dos casos:

- **Le favorece** (baja el precio, sube alguna cuota o acorta algún plazo, sin empeorar nada):
  **propuesta**, no pide aceptación; se le avisa y pasa en la renovación del punto 3.
- **Le perjudica en algo** (sube el precio, baja una cuota, alarga un plazo o baja el nivel de
  informe): **propuesta**, se le pide aceptación con el mismo mecanismo de las condiciones
  (aviso en Cuotly y por correo, aceptar en su pantalla o registrarlo el equipo con contrato).

Y lo que falta decidir de verdad: **¿qué pasa si llega la fecha y no ha aceptado?**

- **Opción A (la que propongo):** sigue en la versión que aceptó, que no se borra ni se cierra;
  la pantalla del equipo lo marca como "en versión anterior" y el propietario decide qué hacer.
  Es lo que dice §104 ("se conserva versión aceptada").
- **Opción B:** pasa igualmente y queda con la aceptación pendiente, como hoy las condiciones.
  Es más simple, pero cobra un precio más alto sin consentimiento.

## 5. ¿Reinicia la permanencia?

**Propuesta: no.** RN-COM-05 reinicia la permanencia en un cambio **voluntario** de plan, y aquí
el cambio lo hace el espacio, no el restaurante. Pasar a la versión nueva conserva la permanencia
que tuviera.

## 6. Precios negociados

RN-COM-14 prohíbe precios negociados individuales. **Propuesta:** todos los restaurantes de una
versión pasan juntos, cada uno en su renovación. El único que se queda atrás es el del punto 4,
opción A, y lo hace por no aceptar, no por un precio pactado.

## 7. Archivar

**Propuesta:** archivar un plan o una versión la quita de las altas y de los cambios nuevos, y
nada más. Quien la tiene la conserva hasta que pase a otra (punto 3). Nunca se borra (CLAUDE.md).
Un plan archivado que ya no tiene nadie queda en el historial, visible en Versiones.

## 8. Trabajos ya aceptados

**Propuesta:** conservan las condiciones con las que se aceptaron, como ya hacen al cambiar de plan
(RN-COM-15 y RN-COM-17; `accepted_start_sla_hours`). Una versión nueva no reescribe nada hacia
atrás.

## 9. Servicios adicionales

**Propuesta:** las mismas reglas para los servicios (Menú Diario incluido), con la excepción de
su doble precio (RN-COM-08): el precio con Premium+ es un campo más del servicio y cambia con él.

## 10. Lo que habría que tocar además del código

- **CLAUDE.md** fija los precios de Restavor (decisión 39) y el de Menú Diario. Si Bosco cambia
  uno de esos desde la aplicación, esas líneas tienen que cambiar el mismo día; si no, la próxima
  revisión lo marcaría como un error.
- **La comparativa de versiones** (M55) pasaría a enseñar también precio y cuotas de cada versión,
  como en el dibujo; hoy compara solo el texto de las condiciones.

---

## Qué necesito de ti

Un sí o un cambio en cada punto, y sobre todo **la opción A o B del punto 4**. Con eso escribo la
decisión, las reglas del PRD y los tests antes de programar nada.
