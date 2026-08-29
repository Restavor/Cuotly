# CUOTLY — ESPECIFICACIÓN MAESTRA ACTUALIZADA

**Producto:** Cuotly  
**Marca:** Cuotly · by Restavor  
**Propietario del producto:** Bosco Núñez  
**Empresa creadora:** Restavor  
**Estado del documento:** Especificación funcional y técnica consolidada  
**Fecha de consolidación:** 29 de agosto de 2026  
**Idioma inicial del producto:** Español  

---

## Índice general

1. Identidad, visión y alcance.
2. Modelo comercial.
3. Cuentas, contextos y acceso.
4. Roles, permisos y equipo.
5. Navegación.
6. Grupos y establecimientos.
7. Solicitudes, trabajos y tareas.
8. Clasificación, consumos, plazos y correcciones.
9. Asignación y carga.
10. Menú Diario.
11. Mensajes.
12. Notificaciones.
13. Calendario.
14. Finanzas.
15. Informes, analítica y oportunidades.
16. Planes configurables.
17. Archivos.
18. Integraciones.
19. Ajustes, administración y soporte.
20. Seguridad y auditoría.
21. Aplicaciones, diseño y accesibilidad.
22. Arquitectura técnica.
23. Rendimiento y continuidad.
24. Casos límite.
25. Matriz de permisos.
26. Pendientes deliberados.
27. Decisiones obsoletas.
28. Criterios de aceptación.

---
## 0. Propósito, autoridad y forma de usar este documento

Este documento reúne las decisiones vigentes de Cuotly después de revisar y ampliar la documentación original. Es la fuente maestra para diseñar, dividir en versiones y desarrollar el producto.

Cuando este documento contradiga textos, mockups o conversaciones anteriores, prevalece este documento. Entre otras cosas, sustituye expresamente decisiones antiguas sobre:

- una concepción de Cuotly limitada exclusivamente a Restavor;
- 25 actualizaciones de Menú Diario, que pasan a ser 30;
- horarios contractuales anteriores;
- precios antiguos de los planes de mantenimiento;
- roles o estados todavía provisionales;
- una navegación móvil basada solo en menú hamburguesa;
- la idea de que todas las integraciones externas deban monitorizarse;
- una posible obligación técnica absoluta de aceptar notificaciones push, que los sistemas operativos no permiten imponer.

Este documento define el producto completo conocido, no la primera versión. La división por versiones se realizará después. Los apartados marcados como **Pendiente deliberadamente** no deben completarse inventando reglas durante el desarrollo.

Las aclaraciones, correcciones y reglas nuevas que vayan surgiendo después de esta
consolidación se registran en `docs/DECISIONES.md`, que manda sobre lo que contradiga a
este documento.

---

# PARTE I — IDENTIDAD, VISIÓN Y ALCANCE

## 1. Qué es Cuotly

Cuotly es una plataforma SaaS multiempresa para organizar y controlar el mantenimiento digital de restaurantes y otros establecimientos.

Debe permitir que un proveedor de mantenimiento gestione desde un único lugar:

- grupos de clientes;
- establecimientos;
- planes y servicios;
- solicitudes;
- trabajos;
- tareas;
- trabajadores;
- supervisión;
- mensajes;
- archivos;
- consumos;
- plazos;
- pagos;
- informes;
- analítica;
- oportunidades de mejora;
- Menú Diario;
- actividad e historial.

Desde el lado del restaurante, Cuotly debe permitir conocer con claridad:

- qué tiene contratado;
- qué consumos ha utilizado y cuáles le quedan;
- qué ha solicitado;
- en qué estado se encuentra cada petición;
- qué documentación se ha compartido;
- qué pagos tiene pendientes;
- qué resultados ofrece su web;
- qué oportunidades han sido aprobadas para mostrarle;
- qué menús ha preparado o publicado.

Cuotly no es únicamente un gestor de tareas. Su función principal es responder de forma sencilla a dos preguntas:

1. **¿Qué está pasando ahora?**
2. **¿Qué necesita atención o una decisión?**

## 2. Evolución de Restavor a plataforma multiempresa

Cuotly nace para Restavor, pero no está limitado a Restavor.

La estructura definitiva es:

```text
Plataforma Cuotly
└── Espacios de mantenimiento
    ├── Espacio de Restavor
    ├── Espacio de otro proveedor
    └── Espacio de otro proveedor
        └── Grupos de clientes
            └── Establecimientos
```

Reglas:

- El espacio de Restavor se crea automáticamente solo para Bosco.
- Se crea con sus planes, servicios, horarios y reglas ya configurados.
- Cualquier usuario registrado puede solicitar la creación de su propio espacio.
- Bosco aprueba o rechaza inicialmente esas solicitudes.
- Cada nuevo espacio utiliza una plantilla genérica y configura sus propios planes.
- Todos los espacios conservan la identidad `Cuotly · by Restavor`.
- Un espacio puede personalizar nombre y logotipo, pero no convertir Cuotly en una aplicación de marca blanca.
- Un mismo usuario puede pertenecer a varios espacios, grupos o establecimientos con papeles diferentes.
- Un establecimiento solo puede estar activo en un espacio de mantenimiento a la vez.
- Se permitirá transferir un establecimiento entre espacios conservando el historial que corresponda.

## 3. Principios del producto

### 3.1 Claridad antes que densidad

No se deben añadir gráficos, métricas o módulos solo para que el panel parezca avanzado. Cada elemento debe ayudar a comprender una situación o tomar una decisión.

### 3.2 Separación estricta de contextos

La plataforma, los espacios de mantenimiento, los grupos y los establecimientos son contextos distintos. La interfaz debe indicar siempre dónde está el usuario.

### 3.3 Permisos antes que ocultación visual

Ocultar un botón no es suficiente. Toda operación debe validarse en servidor según espacio, establecimiento, rol y permiso.

### 3.4 Historial antes que sobrescritura

Los cambios importantes crean versiones o registros de auditoría. No se debe perder qué ocurrió, quién lo hizo ni qué valor existía antes.

### 3.5 Automatización con control humano

Cuotly puede recomendar, clasificar, detectar y preparar, pero las decisiones comerciales u operativas sensibles mantienen aprobación humana cuando se haya definido.

### 3.6 No inventar datos

Los informes deben diferenciar:

- datos medidos;
- datos introducidos manualmente;
- estimaciones;
- recomendaciones;
- información no disponible.

### 3.7 El cliente no ve la organización interna

El restaurante se comunica con el **Equipo de mantenimiento**. No ve nombres, fotografías, supervisores, cargas ni conflictos internos del equipo.

---

# PARTE II — MODELO COMERCIAL

## 4. Planes SaaS de Cuotly para espacios de mantenimiento

Estos planes regulan lo que paga el propietario de un espacio por utilizar Cuotly. No deben confundirse con los planes que ese espacio vende a sus restaurantes.

### 4.1 Cuotly Pro

- **Precio:** 149 € + IVA al mes.
- **Periodicidad:** mensual.
- **Espacios incluidos:** 1.
- **Establecimientos activos incluidos:** 5.
- **Usuarios internos de mantenimiento incluidos:** 5.
- **Usuarios de restaurantes/clientes:** ilimitados.
- **Establecimientos archivados:** ilimitados.
- **Almacenamiento incluido:** 20 GB.
- **Establecimiento activo adicional:** 25 € + IVA al mes.
- **Usuario interno adicional:** 15 € + IVA al mes.
- Sin API pública incluida.

### 4.2 Cuotly Agency

- **Precio:** 499 € + IVA al mes.
- **Periodicidad:** mensual.
- **Espacios incluidos:** 1 por suscripción, salvo acuerdo futuro distinto.
- **Establecimientos activos:** ilimitados bajo uso razonable.
- **Establecimientos archivados:** ilimitados.
- **Usuarios internos y de clientes:** ilimitados bajo uso razonable.
- **Almacenamiento incluido:** 100 GB.
- Incluye informes y capacidades avanzadas.
- Tiene prioridad superior en el soporte de Cuotly.
- La API y los webhooks se contemplan como posibilidad futura, no como función actual.

### 4.2.1 Reglas de suscripción por espacio

- Cada suscripción cubre un espacio de mantenimiento.
- Una misma persona puede ser propietaria de varios espacios, cada uno con su suscripción.
- Los restaurantes pagan al propietario de su espacio por los servicios de mantenimiento.
- Los propietarios de espacios pagan a Bosco por utilizar Cuotly.
- Cuotly no cobra las cuotas que los espacios facturan a sus restaurantes.
- El uso futuro de IA se pagará aparte por el propietario del espacio; no está incluido de forma ilimitada en Pro o Agency.

### 4.3 Significado de “ilimitado”

“Ilimitado” no significa uso abusivo o técnicamente infinito. Cuotly medirá consumo de almacenamiento, tráfico y actividad.

Ante un uso anormal:

1. Se informa al propietario.
2. Bosco revisa el caso.
3. Se plantea ampliación, condición especial o plan específico.
4. No se bloquea inesperadamente sin comunicación, salvo abuso, seguridad o riesgo grave.

### 4.4 Prueba gratuita

- Duración: 7 días.
- El solicitante elige Pro o Agency antes de comenzar.
- Puede probar las funciones del plan elegido.
- Máximo durante la prueba: 2 establecimientos activos.
- Una sola prueba gratuita por persona o negocio.
- La prueba comienza cuando Bosco aprueba y se crea el espacio.
- Si termina sin pago, el espacio queda archivado en modo lectura.
- Puede pagarse y reactivarse durante 30 días; después se aplica la eliminación operativa prevista.

### 4.5 Pagos de Cuotly

- Cuotly no utilizará Stripe inicialmente.
- Métodos: transferencia bancaria o Bizum.
- Cuotly genera importe, concepto y referencia.
- El propietario puede adjuntar justificante.
- Bosco o un Administrador de Cuotly autorizado confirma manualmente el pago.
- Los avisos se envían 3 días antes, el día del vencimiento, a las 24 h, a las 48 h y antes de las 72 h.

### 4.6 Impago de Cuotly

- Desde vencimiento hasta +72 horas naturales: periodo de gracia.
- A las 72 horas: espacio **Archivado por impago** y acceso de solo lectura.
- En ese modo se puede pagar, exportar o contactar con soporte.
- Existe un plazo de 30 días para pagar y reactivar.
- Tras confirmarse el pago, el espacio se reactiva con sus datos.
- Transcurridos 30 días sin pago, se elimina la información operativa.
- Los registros que deban conservarse por obligaciones legales quedan aislados; la regla jurídica exacta está pendiente de revisión profesional.

### 4.7 Cambio de plan Cuotly

- Pro → Agency: inmediato, con diferencia proporcional.
- Agency → Pro: en la siguiente renovación.
- Antes de bajar a Pro se deben resolver excesos de establecimientos o usuarios.
- Los adicionales de Pro se recalculan automáticamente.

## 5. Planes de mantenimiento de Restavor

Todos los precios son más IVA. Cada establecimiento contrata su propio plan, incluso cuando pertenece a un grupo.

### 5.1 Reglas comunes

- Facturación mensual.
- Permanencia mínima inicial: 3 meses.
- Tras esos tres meses, renovación mensual automática.
- Si se cancela antes, deben abonarse las mensualidades restantes.
- Un cambio voluntario de plan inicia una nueva permanencia de 3 meses.
- Los consumos se renuevan en la fecha de renovación del establecimiento.
- Los consumos no se acumulan.
- Los trabajos fuera de plan se presupuestan aparte.
- No existen bolsas de horas de trabajo.

### 5.2 Básico

- **Precio:** 99 € al mes + IVA.
- **Cambios incluidos:** ninguno.
- **Fotografías incluidas:** ninguna.
- Cualquier modificación se presupuesta aparte.
- Tiempo máximo para comenzar: 48 horas laborables.
- Panel, mensajes, archivos, pagos e historial completos.
- Solicitudes orientadas a presupuesto.
- Analítica esencial.
- Informe trimestral básico.
- Backup trimestral dentro de lo que permita técnicamente la plataforma web.
- Las oportunidades se detectan internamente, pero no se muestran automáticamente en el informe.

### 5.3 Impulso

- **Precio:** 399 € al mes + IVA.
- **16 cambios pequeños al mes.**
- **3 cambios medianos al mes.**
- **12 cambios fotográficos al mes.**
- No incluye cambios grandes; se presupuestan aparte.
- Tiempo máximo para comenzar: 24 horas laborables.
- Analítica detallada.
- Informe mensual completo.
- Oportunidades básicas aprobadas.
- Backup mensual dentro de lo técnicamente disponible.

### 5.4 Premium

- **Precio:** 599 € al mes + IVA.
- **25 cambios pequeños al mes.**
- **5 cambios medianos al mes.**
- **1 cambio grande al mes.**
- **24 cambios fotográficos al mes.**
- Tiempo máximo para comenzar: 24 horas laborables.
- Prioridad interna superior a Impulso.
- Analítica avanzada.
- Informe mensual avanzado.
- Oportunidades avanzadas aprobadas.
- Backup semanal dentro de lo técnicamente disponible.

### 5.5 Backups de las webs

La palabra “backup” solo puede utilizarse para aquello que realmente sea recuperable.

- Se guardarán contenidos, recursos, configuración y archivos que la plataforma externa permita exportar.
- Si LandingSite u otra plataforma no permite exportar una web completa, Cuotly no afirmará que existe una copia completa restaurable.
- Debe mostrarse qué se respaldó, cuándo, por quién y con qué limitaciones.

## 6. Menú Diario de Restavor

Menú Diario es un servicio independiente de los planes de mantenimiento.

- **Precio general:** 229 € + IVA al mes.
- **Precio para establecimientos Premium:** 199 € + IVA al mes.
- **Permanencia mínima:** 3 meses.
- **Actualizaciones incluidas:** 30 por ciclo mensual.
- No se acumulan.
- Tres plantillas personalizadas iniciales incluidas una sola vez.
- El restaurante puede elegir cualquiera de las tres en cada menú.
- Sustituciones, nuevas plantillas y rediseños se presupuestan aparte.
- Puede contratarse con o sin plan de mantenimiento.

---

# PARTE III — IDENTIDAD, CUENTAS, CONTEXTOS Y ACCESO

## 7. Niveles de identidad

### 7.1 Cuenta personal

- Una persona utiliza una sola cuenta y un solo correo.
- No se permiten cuentas compartidas.
- La misma cuenta puede tener distintos roles según espacio o establecimiento.
- Los registros de actividad siempre identifican a la persona real.

### 7.2 Registro e inicio de sesión

- Correo y contraseña con verificación obligatoria.
- Inicio de sesión con Google.
- Inicio de sesión con Apple en iOS.
- Recuperación mediante enlace temporal al correo verificado.
- Un usuario puede consultar y cerrar sesiones activas.
- Las sesiones habituales pueden mantenerse hasta 30 días.
- Las acciones sensibles pueden volver a exigir contraseña o segundo factor.

### 7.3 Cambio de correo

- Requiere contraseña actual.
- Requiere verificar el correo nuevo.
- Sigue existiendo un solo correo principal.

### 7.4 Usuario ya registrado

Cuando se intenta añadir un correo ya registrado:

- No se crea otra cuenta.
- Se muestra `Este usuario ya está registrado en Cuotly`.
- Aparece la acción **Añadir al espacio**.
- Se asignan rol y establecimientos.
- El usuario recibe una notificación sobre el nuevo acceso.

### 7.5 Invitaciones nuevas

- Solo se envían cuando la persona todavía no está registrada.
- Caducan en 7 días.
- Pueden reenviarse o cancelarse.

## 8. Selector de contexto

Todos los usuarios entran primero en **Inicio**, pero antes Cuotly determina el contexto.

- Con un solo contexto accesible: entrada automática.
- Con varios contextos: selector inicial.
- Bosco siempre ve el selector para poder elegir Administración de Cuotly, Restavor, otros espacios o paneles de restaurante.
- Existe una acción persistente **Cambiar de espacio** que vuelve al selector.
- El selector muestra nombre, logotipo, tipo, rol y alertas rápidas.
- Pulsar una alerta abre el elemento exacto después de comprobar permisos.

## 9. Onboarding de un nuevo espacio

Tras la aprobación, el propietario completa progresivamente:

1. Datos del espacio.
2. Logotipo.
3. Zona horaria.
4. Horario operativo.
5. Impuestos.
6. Planes y servicios.
7. Primer establecimiento.
8. Primer trabajador.
9. Notificaciones.
10. Seguridad.

Este asistente no utiliza IA. Es una secuencia de formularios y tareas pendientes.

## 10. Solicitud de creación de espacio

Campos:

- nombre del negocio;
- responsable;
- correo;
- teléfono;
- número estimado de establecimientos;
- número estimado de usuarios internos;
- uso previsto;
- plan Pro o Agency;
- datos fiscales básicos.

Estados:

- Borrador;
- Enviada;
- En revisión;
- Necesita información;
- Aprobada;
- Rechazada con motivo.

Inicialmente Bosco es el único aprobador. Más adelante podrá delegar mediante permisos de Administrador de Cuotly.

---

# PARTE IV — ROLES, PERMISOS Y EQUIPO

## 11. Roles de plataforma

### 11.1 Propietario de Cuotly

Bosco es el Propietario de Cuotly y dispone del control global.

Puede:

- aprobar espacios;
- gestionar suscripciones;
- ver métricas globales;
- administrar la plataforma;
- entrar en Modo soporte;
- nombrar Administradores de Cuotly en el futuro.

### 11.2 Administrador de Cuotly

Rol futuro y configurable por permisos.

Puede llegar a:

- revisar solicitudes de espacios;
- gestionar pagos y suscripciones;
- atender soporte;
- consultar métricas técnicas;
- entrar mediante soporte auditado;
- suspender cuentas por incumplimiento.

No puede:

- transferir la propiedad de Cuotly;
- modificar datos personales de Bosco;
- eliminar la plataforma;
- concederse privilegios superiores.

## 12. Roles de un espacio de mantenimiento

### 12.1 Propietario del espacio

- Control total del espacio.
- Es el único que invita trabajadores internos.
- Es el único que nombra o retira administradores.
- Es el único que asigna o cambia supervisores.
- Es el único que puede transferir, archivar o solicitar eliminar el espacio.
- Puede ejecutar trabajos únicamente como recurso operativo cuando no haya otra persona capaz o disponible.
- Ve toda la operación, finanzas, informes, auditoría y configuración.

### 12.2 Administrador de mantenimiento

- Gestiona operación, restaurantes, solicitudes, trabajos, tareas, equipo autorizado, finanzas e informes.
- Puede ejecutar trabajos si tiene la capacidad **Realizar trabajos**.
- Puede marcar pagos, reasignar cuando esté autorizado y gestionar incidencias.
- No puede cambiar configuraciones contractuales reservadas al propietario.

### 12.3 Trabajador

- Acceso operativo limitado a establecimientos, trabajos y tareas autorizados.
- Puede consultar todo el historial operativo del restaurante autorizado.
- No ve finanzas globales, credenciales, usuarios privados ni configuración sensible.
- Puede marcar como pagado un cobro desde la ficha de un restaurante asignado, sin acceder a Finanzas.
- Puede pedir reasignación.
- Puede declarar disponibilidad.
- Puede proponer oportunidades.
- Conserva acceso de lectura al historial operativo correspondiente después de terminar un trabajo mientras continúe autorizado.

## 13. Supervisor como relación, no como rol

“Supervisor” no es un rol independiente. Es una relación entre un Administrador y un Trabajador.

- Un administrador puede supervisar varios trabajadores.
- Cada trabajador tiene un Administrador principal.
- Puede tener un sustituto temporal.
- El sustituto tiene fecha de inicio y fin.
- Puede retirarse antes o ampliarse.
- Principal y sustituto reciben los avisos correspondientes.
- Solo el propietario del espacio crea o cambia estas relaciones.
- Al nombrar un administrador, Cuotly ofrece **Asignar trabajador** o **Continuar sin trabajador**.
- Un administrador puede empezar sin supervisados y recibirlos posteriormente.

## 14. Roles de cliente/restaurante

### 14.1 Propietario global del grupo

- Acceso a todos los establecimientos actuales y futuros del grupo.
- Ve resumen consolidado y puede entrar en cada establecimiento.
- Puede haber varios propietarios globales.

### 14.2 Propietario local

- Acceso únicamente a su establecimiento.
- Puede gestionar usuarios y datos permitidos de ese establecimiento.

### 14.3 Editor

- Acceso a establecimientos asignados.
- Puede ver informes siempre.
- Puede recibir permiso específico para editar datos del establecimiento.
- Puede recibir permiso específico para ver facturación.
- Puede invitar a Editor o Consulta dentro de sus establecimientos, sin conceder propiedad ni eliminar al último propietario.

### 14.4 Consulta

- Acceso de lectura.
- No responde mensajes.
- Para ver informes debe solicitar permiso a su propietario.
- No ve facturación.

## 15. Identidad visible del equipo

El cliente nunca ve nombres o fotografías individuales de propietarios, administradores o trabajadores de mantenimiento.

Toda comunicación aparece como:

> **Equipo de mantenimiento**

Internamente, Cuotly registra quién realizó cada acción.

## 16. Estados de miembros internos

- Invitado.
- Activo.
- Ausente temporalmente.
- Inactivo.
- Acceso revocado.

Al quedar inactivo o revocado:

- pierde acceso inmediatamente;
- deja de recibir asignaciones y notificaciones;
- se identifican trabajos pendientes de reasignar;
- se conserva todo su historial.

## 17. Especialidades

Un trabajador puede tener varias:

- Web.
- Diseño.
- Textos.
- SEO.
- Menú Diario.
- Analítica.
- General.

General permite realizar cualquier categoría, sin eliminar la posibilidad de registrar especialidades concretas.

---
# PARTE V — NAVEGACIÓN Y EXPERIENCIA POR CONTEXTO

## 18. Navegación global del espacio de mantenimiento

Dentro de un espacio, propietario y administradores disponen de una visión general de todos los restaurantes. No se obliga a elegir un restaurante antes de ver la operación global.

Menú principal de escritorio:

1. Inicio.
2. Restaurantes.
3. Solicitudes.
4. Trabajos.
5. Tareas.
6. Menú Diario.
7. Mensajes.
8. Calendario.
9. Finanzas.
10. Informes.
11. Equipo.
12. Planes y servicios.
13. Agente Cuotly.
14. Ajustes.

`Agente Cuotly` aparece en la zona inferior, antes de Ajustes, con la etiqueta `Próximamente`.

## 19. Inicio según rol

Todos entran en Inicio, pero su contenido cambia.

### 19.1 Propietario del espacio

- resumen general;
- restaurantes activos y estados;
- solicitudes y trabajos críticos;
- carga del equipo;
- Menú Diario;
- ingresos, pendientes e impagos;
- incidencias;
- actividad reciente.

### 19.2 Administrador

- resumen operativo general;
- prioridad especial a trabajadores supervisados;
- solicitudes pendientes;
- trabajos cercanos a vencer;
- tareas y bloqueos;
- finanzas e informes permitidos.

### 19.3 Trabajador

- Mi trabajo;
- trabajo recomendado para hacer ahora;
- cola personal;
- tareas;
- bloqueos;
- mensajes;
- avisos.

La recomendación no obliga: puede comenzar otro trabajo autorizado.

### 19.4 Propietario global de restaurantes

- resumen del grupo;
- establecimientos;
- situación financiera consolidada con IVA;
- solicitudes y trabajos recientes;
- consumos;
- informes;
- menús.

## 20. Sección Restaurantes y ficha interna

`Restaurantes` muestra todos los establecimientos del espacio. Desde ahí se entra en la ficha de uno.

Ruta orientativa:

`Restavor / Restaurantes / Magariños`

La ficha interna contiene cinco pestañas secundarias:

1. **Resumen**.
2. **Operación**: solicitudes, trabajos, tareas y Menú Diario.
3. **Informes y datos**.
4. **Gestión**: plan, pagos, usuarios, archivos e integraciones.
5. **Historial**.

Estas pestañas solo aparecen después de entrar en un restaurante. No son páginas anteriores al espacio ni forman parte del panel simplificado del cliente.

## 21. Navegación móvil

### 21.1 Propietario y administrador

- Inicio.
- Solicitudes.
- Trabajos.
- Mensajes.
- Más.

### 21.2 Trabajador

- Inicio.
- Trabajos.
- Tareas.
- Mensajes.
- Más.

### 21.3 Restaurante con Menú Diario

- Inicio.
- Solicitudes.
- Menú Diario.
- Mensajes.
- Más.

### 21.4 Restaurante sin Menú Diario

- Inicio.
- Solicitudes.
- `+ Nueva solicitud`.
- Mensajes.
- Más.

`Más` contiene el resto de módulos según permisos. El módulo Menú Diario solo aparece a trabajadores asignados a ese servicio, además de propietario y administradores.

## 22. Búsqueda global

Disponible desde la cabecera, acceso `Ctrl/Cmd + K` y botón móvil.

Puede buscar, según permisos:

- grupos;
- establecimientos;
- solicitudes;
- trabajos;
- tareas;
- menús;
- usuarios;
- planes;
- servicios;
- informes;
- pagos;
- conversaciones;
- archivos.

Criterios:

- nombre;
- código;
- identificador;
- estado;
- texto;
- responsable;
- plan;
- fechas.

Incluye búsquedas recientes y navegación directa. Nunca devuelve resultados a los que el usuario no tenga acceso.

## 23. Acción Crear

Existe un botón global **Crear**. Sus opciones dependen del contexto y permisos: establecimiento, solicitud, trabajo, tarea, menú, evento, usuario, servicio, oportunidad u otros elementos permitidos.

---

# PARTE VI — GRUPOS Y ESTABLECIMIENTOS

## 24. Jerarquía de clientes

La jerarquía es:

`Grupo o empresa cliente → Establecimientos`

- Un grupo puede tener uno o varios establecimientos.
- Cada establecimiento mantiene plan, consumos, pagos, trabajos y datos propios.
- El grupo puede tener varios propietarios globales.
- Puede existir un propietario local por establecimiento.
- Una cuenta puede pertenecer a varios grupos.

## 25. Alta y asignación de acceso

- Solo propietario y administradores del espacio crean establecimientos.
- Los propietarios globales reciben automáticamente acceso a nuevos establecimientos del grupo.
- Un Editor puede asignarse a uno, varios, todos los actuales o todos los actuales y futuros.
- Los accesos retirados desaparecen inmediatamente, pero la actividad histórica permanece.

## 26. Código interno

Cada establecimiento recibe un código automático, por ejemplo `EST-0048`.

Sirve para:

- búsqueda;
- soporte;
- identificación inequívoca;
- referencias internas.

No tiene por qué ser prominente para el cliente.

## 27. Estados del establecimiento

- **Configurando**.
- **Activo**.
- **Pausado**.
- **Finalizando**.
- **Solo lectura**.
- **Suspendido**.
- **Archivado**.

En Pausado se puede consultar, pero no crear solicitudes o menús. Los motivos específicos, como impago, se muestran junto al estado.

## 28. Datos del establecimiento

Incluye al menos:

- nombre comercial;
- razón social;
- identificación fiscal;
- dirección;
- teléfonos;
- correos y contactos;
- sitio web;
- dominio;
- horarios;
- plan y servicios;
- responsables;
- plataformas externas utilizadas;
- datos financieros operativos;
- notas internas;
- archivos principales.

El propietario puede editar contacto y datos fiscales. Los Editores solo si tienen permiso. Cambiar datos en la ficha de Cuotly no cambia automáticamente contenido público de la web: eso requiere una solicitud.

## 29. Notas internas

- Propietario y administradores ven todas.
- Los trabajadores ven únicamente las notas operativas de establecimientos autorizados.
- Los clientes no ven notas internas.

## 30. Fin del mantenimiento

Al terminar el mantenimiento por una causa distinta al ciclo específico de impago:

- el cliente dispone de 24 horas en solo lectura;
- después el establecimiento queda suspendido;
- los datos no se eliminan automáticamente;
- el historial se conserva según las reglas de la plataforma y decisiones legales futuras.

## 31. Copiar y pegar solicitudes

El usuario prefiere la terminología **Copiar solicitud** y **Pegar solicitud**.

- Solo dentro del mismo grupo.
- Copiar no crea una nueva solicitud automáticamente.
- En Nueva solicitud aparece Pegar solicitud.
- Se crea un borrador para el establecimiento destino.
- La IA o reglas vuelven a analizar el contenido.
- El consumo pertenece al establecimiento destino.
- Los adjuntos copiados se muestran para revisión y no se envían automáticamente.

---

# PARTE VII — SOLICITUDES, TRABAJOS Y TAREAS

## 32. Diferencia entre Solicitud, Trabajo y Tarea

### Solicitud

Petición planteada por el restaurante. Todavía puede necesitar análisis, información, clasificación, presupuesto o aceptación.

### Trabajo

Unidad operativa creada únicamente después de la aceptación final válida y de resolver consumo o presupuesto.

### Tarea

Paso interno que ayuda a ejecutar un trabajo o una actividad independiente. Es opcional para trabajos pequeños y recomendable u obligatoria en trabajos grandes.

## 33. Creación de una solicitud

Flujo base:

1. El restaurante crea un borrador.
2. Añade descripción, contexto y archivos.
3. Envía.
4. Cuotly analiza y propone clasificación.
5. Propietario o administrador confirma o corrige clasificación y consumo.
6. Si falta información, se solicita.
7. El restaurante recibe la propuesta final.
8. El restaurante acepta.
9. Se consume el cambio o se aplica el presupuesto.
10. Se crea el trabajo.
11. Se asigna o queda pendiente de asignación.

### 33.1 Tres tiempos distintos

Cuotly no debe mezclar:

1. **Primera atención interna:** comienza cuando la solicitud llega al espacio y utiliza 48 horas laborables en Básico o 24 en Impulso/Premium. Reciben aviso propietario y administradores; un trabajador solo cuando ya exista asignación válida.
2. **Inicio operativo:** después de la aceptación final y la asignación, mide el tiempo disponible para pulsar Comenzar.
3. **Ejecución:** comienza al pulsar Comenzar y utiliza el plazo de 72 o 120 horas laborables según categoría.

Si durante la validación se corrige clasificación, alcance o consumo, el cliente vuelve a aceptar y el contador de inicio operativo comienza otra vez desde cero. La solicitud conserva todos los intentos y cambios anteriores.

## 34. Estados de solicitud

Estados internos y etiquetas amigables pueden diferir, pero deben mapear como mínimo:

- Borrador.
- Recibida.
- Analizando / En revisión.
- Necesita información.
- Pendiente de validación interna.
- Pendiente de aceptación del cliente.
- Aceptada.
- En proceso.
- Publicada / Completada.
- Corrección solicitada.
- En corrección.
- Cerrada.
- Cancelada antes de empezar.
- Cancelada después de empezar.
- Rechazada.

## 35. Rechazo de una solicitud

El equipo puede rechazar una petición imposible, no prestada o fuera de servicio.

- Se explica el motivo al cliente.
- No consume cambios.
- Queda en historial.
- Puede ofrecerse alternativa o presupuesto cuando corresponda.

## 36. Estados de trabajo

- Pendiente de asignación.
- Asignado.
- Reasignación solicitada.
- En curso.
- Bloqueado por cliente.
- Pausa autorizada.
- Publicado.
- En corrección.
- Completado.
- Cancelado antes de empezar.
- Cancelado después de empezar.

`Fuera de plazo` es una condición calculada, no un estado independiente. Puede coexistir con En curso, Bloqueado u otro estado.

## 37. Estados de tarea

- Pendiente.
- En curso.
- Bloqueada.
- Completada.
- Cancelada.

El trabajador debe pedir al administrador que cancele una tarea.

## 38. Acción Comenzar

Una vez asignado, el responsable debe pulsar **Comenzar** dentro del plazo máximo de inicio.

- Antes de pulsar, el cliente puede cancelar sin consumir definitivamente el cambio.
- Después de comenzar, una cancelación mantiene el consumo.
- Al comenzar, termina el contador de inicio y comienza el contador de ejecución.
- Un cambio incluido es una obligación contractual del espacio: el trabajador no puede rechazarlo por preferencia personal. Si existe un impedimento, debe escalarlo internamente.
- Un trabajo adicional o presupuestado puede requerir aceptación operativa específica.

## 39. Bloqueos y pausas

Razones válidas:

- falta información del cliente;
- incidente externo grave;
- pausa autorizada por propietario;
- pausa financiera por impago.

Si falta información:

- estado `Bloqueado · Esperando al restaurante`;
- se pausa el contador;
- se conserva el tiempo restante;
- se reanuda al recibir lo necesario.

El trabajador puede marcar un bloqueo por cliente. El administrador recibe aviso y puede revertirlo con auditoría.

## 40. Publicación

El trabajador publica directamente cuando termina. No necesita aprobación previa del supervisor.

- El supervisor recibe notificación posterior.
- Puede revisar lo publicado.
- Un error del equipo se corrige sin consumir cambios ni la corrección mínima del cliente.

---

# PARTE VIII — CLASIFICACIÓN, CONSUMOS, PLAZOS Y CORRECCIONES

## 41. Categorías de cambio

### 41.1 Pequeño

Ejemplos:

- nombre;
- frase;
- precio;
- título;
- contacto;
- enlace;
- un día de horario;
- media o número de reseñas;
- logo entregado;
- texto ya redactado por el cliente.

### 41.2 Fotográfico

Incluye:

- subir o sustituir una fotografía entregada por el cliente;
- retoque básico para que quede correctamente en la web.

No incluye:

- producción fotográfica;
- retoque avanzado;
- reconstrucciones complejas;
- búsqueda o compra de derechos sobre imágenes.

### 41.3 Mediano

Ejemplos:

- modificar sección de carta;
- añadir aproximadamente cinco platos;
- texto largo de Historia o Inicio;
- horario completo;
- reseña destacada;
- botón de delivery correctamente integrado en la web.

### 41.4 Grande

Ejemplos:

- carta completa;
- contenido amplio de una sección;
- menú especial con diseño;
- modificación amplia de reseñas;
- sección nueva importante como Eventos.

## 42. Clasificación y aceptación

- Cuotly propone categoría y consumo.
- Propietario o administrador valida antes de presentarlo al cliente.
- El cliente acepta la propuesta definitiva.
- El consumo se registra en esa aceptación.
- Si una corrección interna cambia el consumo, se solicita nueva aceptación y el contador de inicio se reinicia desde cero.
- Todo el historial anterior se conserva.

## 43. Reglas de consumo

- Cada cambio consume una unidad de su categoría, no sus puntos de carga laboral.
- Menú Diario utiliza actualizaciones separadas.
- Un trabajo presupuestado aparte no consume la bolsa del plan.
- Consumos devueltos, corregidos o compensatorios se auditan.
- Una renovación no modifica el periodo al que pertenece un consumo ya aceptado.

## 44. Reloj contractual de trabajos

El reloj laboral de cambios y trabajos funciona de manera continua:

- **Inicio:** lunes a las 09:00.
- **Fin:** sábado a las 14:30.
- Incluye noches entre semana.
- Se pausa desde el sábado a las 14:30 hasta el lunes a las 09:00.
- Se pausa en festivos configurados para el espacio.
- Se calcula en minutos laborables.

Ejemplos:

- Una petición del sábado a las 14:00 consume 30 minutos y continúa el lunes a las 09:00.
- Una petición del sábado por la tarde o domingo empieza a contar el lunes a las 09:00.
- La disponibilidad personal del trabajador no cambia este reloj.

## 45. Plazo para comenzar

- Básico: máximo 48 horas laborables.
- Impulso: máximo 24 horas laborables.
- Premium: máximo 24 horas laborables, con prioridad superior.

El cliente no ve que Premium se coloque internamente por delante de Impulso.

Además de los avisos porcentuales generales, cuando queden 2 horas laborables se genera una alerta importante para responsable, supervisor y propietario. Cuando quede 1 hora, Cuotly puede sugerir reasignación. Al vencer, exige intervención.

## 46. Plazo de ejecución

Separado del plazo de inicio:

| Tipo | Rango mostrado | Máximo operativo |
|---|---:|---:|
| Pequeño | 1–3 días laborables | 72 horas laborables |
| Fotográfico | 1–3 días laborables | 72 horas laborables |
| Mediano | 1–3 días laborables | 72 horas laborables |
| Grande | 3–5 días laborables | 120 horas laborables |

- El cliente ve rangos o fechas aproximadas.
- Propietario, administradores y responsable ven el contador exacto.

## 47. Orden de la cola

1. Trabajos vencidos.
2. Trabajos próximos a vencer.
3. Prioridad del plan.
4. Antigüedad entre trabajos comparables.

El propietario puede reordenar manualmente con motivo y auditoría. Cuotly recomienda al trabajador el siguiente trabajo, pero este puede elegir otro autorizado.

## 48. Corrección mínima gratuita

Regla:

> 1 cambio realizado → 1 corrección mínima gratuita sobre ese mismo cambio → 0 créditos adicionales.

Condiciones:

- Una sola corrección total.
- Puede utilizarse durante la ejecución o durante las 72 horas laborables posteriores a la publicación.
- Si se usa durante la ejecución, no vuelve a estar disponible después.
- Sirve solo para un microajuste del mismo alcance.
- También se aplica a trabajos presupuestados aparte.
- Preferentemente la realiza el mismo trabajador si está disponible.

Incluye, por ejemplo:

- corregir una palabra o errata;
- ajustar mínimamente un texto ya cambiado;
- corregir colocación básica de una fotografía;
- corregir inmediatamente un precio dentro del mismo cambio.

No incluye:

- añadir contenido nuevo;
- cambiar otra sección;
- sustituir otra fotografía;
- rehacer el trabajo por cambio completo de idea;
- ampliar alcance;
- una segunda corrección.

Los errores imputables al equipo de mantenimiento se corrigen sin consumir esta corrección ni créditos.

## 49. Cancelaciones y devolución

- Antes de que el responsable pulse Comenzar: se devuelve el consumo.
- Después de comenzar: se mantiene el consumo.
- Si el periodo original ya terminó, la devolución crea un crédito compensatorio de la misma categoría en el periodo actual.
- Toda devolución conserva motivo y trazabilidad.

---


# PARTE IX — ASIGNACIÓN, SUPERVISIÓN Y CARGA

## 50. Asignación de trabajadores a establecimientos

- Un trabajador puede estar asignado a uno, varios o todos los establecimientos.
- Puede estar autorizado por especialidad o mediante General.
- Solo trabajadores activos y válidos participan en recomendaciones.

## 51. Asignación automática y recomendada

### Un único trabajador válido

Si existe exactamente un trabajador activo, disponible, especializado y asignado al restaurante, Cuotly lo asigna automáticamente.

### Varios trabajadores válidos

Cuotly recomienda uno. El propietario acepta la recomendación o elige otro.

Factores conceptuales:

1. Capacidad para realizar el trabajo.
2. Asignación al establecimiento.
3. Estado activo.
4. Especialidad.
5. Disponibilidad declarada.
6. Carga actual por puntos.
7. Número y contexto de trabajos activos.
8. Solicitudes próximas a convertirse en trabajo.
9. Plazos cercanos.
10. Reparto equilibrado.

No existe una fórmula porcentual definitiva. Se calibrará durante implementación sin reducirlo a “quien tenga menos puntos”.

### Ningún trabajador válido

- Estado Pendiente de asignación.
- Aviso al propietario y a todos los administradores.
- Propietario o administrador con capacidad operativa puede asumirlo.
- Si nadie lo asume, continúan alertas crecientes.

## 52. Reasignación

- El trabajador puede solicitarla explicando el motivo.
- La aprueba propietario o administrador principal correspondiente.
- Conserva todo el historial.
- El contador no se reinicia.
- El nuevo responsable recibe el tiempo restante exacto.

## 53. Disponibilidad personal

- No existe un horario fijo obligatorio por trabajador.
- Cada trabajador declara disponibilidad variable.
- Sirve para planificación y recomendación.
- No modifica el SLA del cliente.
- Una ausencia aprobada desde Calendario puede marcarlo automáticamente como no disponible.

## 54. Puntos de carga

Miden trabajo humano activo, no consumo del plan ni productividad.

### 54.1 Valores de cambios

| Trabajo | Puntos |
|---|---:|
| Fotográfico | 1 |
| Pequeño | 1 |
| Mediano | 4 |
| Grande | 10 |

### 54.2 Valores de tareas

| Tarea | Duración aproximada | Puntos |
|---|---:|---:|
| Ligera | hasta 15 min | 1 |
| Normal | 15–45 min | 3 |
| Alta | 45–120 min | 6 |
| Muy alta | 2–4 h | 10 |

Para tareas superiores a 4 horas no existe todavía una categoría cerrada; deberá dividirse en tareas o configurarse durante implementación.

### 54.3 Niveles

| Puntos activos | Nivel |
|---|---|
| 0–9 | Baja |
| 10–19 | Normal |
| 20–29 | Alta |
| 30 o más | Muy alta |

No existe máximo duro. El sistema avisa y recomienda, pero la persona autorizada puede asignar manualmente.

### 54.4 Cuándo suman

- Asignado sin comenzar: suma.
- En curso: suma.
- Trabajo humano independiente: suma según tarea.
- Completado: deja de sumar, pero permanece en métricas e historial.
- La carga actual no se acumula eternamente.

### 54.5 Trabajo dividido

- Sin desglose en tareas: el responsable recibe los puntos completos del cambio.
- Si se divide entre varios trabajadores: la carga se calcula por las tareas asignadas.
- Los puntos generales del trabajo dejan de sumarse para evitar duplicación.
- Cada participante recibe los puntos de sus tareas.
- El trabajo conserva su categoría original.

## 55. Comparación de trabajadores

La carga no es una nota de rendimiento.

Las comparaciones de desempeño se segmentan por:

- plan del establecimiento;
- tipo de cambio;
- volumen;
- dificultad;
- cumplimiento de plazos;
- correcciones atribuibles;
- periodo comparable.

Solo propietario y administradores ven comparaciones. No existe ranking público entre trabajadores.

---

# PARTE X — MENÚ DIARIO

## 56. Concepto

El restaurante introduce información y Cuotly genera una plantilla lista para descargar. La publicación en LandingSite es manual mientras no exista API.

## 57. Tipos y cantidad de menús

- Se pueden preparar varios menús futuros.
- Se pueden crear varios menús para el mismo establecimiento y fecha.
- Ejemplos: diario, Navidad, infantil, grupos o evento especial.
- No se limita a tres menús; las tres unidades fijas son plantillas visuales.

Cada menú registra:

- nombre;
- tipo;
- fecha objetivo;
- plantilla;
- contenido;
- versión;
- estado.

## 58. Campos

- Primeros.
- Segundos.
- Postres.
- Bebida.
- Precio.
- Nota u observación.

## 59. Edición y plantillas

- Edición y guardado ilimitados antes de publicación.
- Botón Copiar menú anterior crea un borrador.
- El restaurante selecciona cualquiera de sus tres plantillas.
- Puede descargar PNG o PDF.
- Descargar no consume actualización.

## 60. Consumo de actualizaciones

- Cada menú que el restaurante marca para que el equipo lo publique consume 1 actualización.
- Los menús especiales también consumen.
- El consumo se produce al marcar que quiere publicación por el equipo.
- Si se cancela antes de marcar Publicado, se devuelve.
- Después de Publicado no se devuelve.
- Un error del equipo provoca devolución o corrección sin perjuicio para el cliente.

## 61. Flujo manual de publicación

1. Restaurante prepara y guarda menú.
2. Solicita publicación.
3. Cuotly asigna trabajador de Menú Diario.
4. El trabajador descarga la plantilla generada.
5. La sube manualmente a LandingSite.
6. Pulsa **Marcar como publicado**.

No existe botón Comenzar ni confirmación innecesaria para esta tarea breve.

Al marcar Publicado, Cuotly registra automáticamente:

- fecha y hora;
- usuario;
- versión publicada;
- plantilla;
- consumo;
- notificación al cliente.

## 62. Garantía horaria

- El contenido puede modificarse libremente hasta las 21:00 del día anterior.
- Si la versión definitiva está antes de las 21:00, se garantiza publicación antes de las 08:00.
- Cambios después de las 21:00 se aceptan, pero no se garantiza que entren en la publicación prevista.
- El trabajador ve cambios de versión y hora.
- Menú Diario opera también fines de semana y utiliza su propio calendario de servicio.
- A las 20:00 se recuerda al propietario y Editores si no existe menú preparado para el día siguiente.

## 63. Estados de Menú Diario

- Borrador.
- Guardado / Preparado.
- Publicación solicitada / Enviado.
- Pendiente de asignación.
- Asignado / En revisión.
- Necesita información.
- Revisando.
- Listo para publicar.
- Publicado.
- Cancelado.
- Error de publicación.

## 64. Historial

Se conservan fechas, platos, precio, nota, plantilla, versiones, estados, descargas, solicitudes de publicación, consumo, cancelaciones y usuario publicador.

## 65. Automatización futura de LandingSite

Puede explorarse un agente que acceda y publique, pero no forma parte del producto actual.

Condiciones futuras mínimas:

- cuenta operativa dedicada si es posible;
- credenciales cifradas;
- registro de acciones;
- comprobación del resultado;
- capturas o evidencia;
- alternativa manual;
- gestión de 2FA, CAPTCHA y cambios de interfaz;
- cumplimiento de condiciones del servicio externo.

---

# PARTE XI — MENSAJES Y COMUNICACIÓN

## 66. Tipos de conversación

### 66.1 Conversación de solicitud

Para información, aclaraciones, archivos, clasificación y bloqueos vinculados a una solicitud.

### 66.2 Conversación interna de trabajo

Para coordinación, reasignación, problemas y notas entre miembros del espacio.

### 66.3 Conversación general del establecimiento

Para cuestiones no vinculadas inicialmente a una solicitud. Puede convertirse en solicitud.

## 67. Reglas

- No existen chats privados cliente–trabajador.
- El cliente ve Equipo de mantenimiento.
- Propietario y administradores ven todas las conversaciones del espacio.
- El trabajador participa solo en establecimientos y trabajos autorizados.
- Las notas internas están estrictamente separadas de mensajes del cliente.
- Consulta puede leer, pero no responder.
- Se muestran leído y no leído.
- Un mensaje puede editarse durante 10 minutos.
- Tras editarlo aparece `Editado`.
- Los mensajes no pueden eliminarse.
- Se admiten imágenes, PDF, Word, Excel y texto; no vídeos ni ejecutables.
- Al terminar la ventana de corrección, la conversación de la solicitud pasa a solo lectura.
- Una necesidad nueva requiere una nueva solicitud.

## 68. Conversión de conversación general

`Convertir en solicitud` crea un borrador con mensajes y adjuntos relevantes. Antes de enviar se revisa alcance, destinatario y archivos.

---

# PARTE XII — NOTIFICACIONES

## 69. Canales

- Centro dentro de Cuotly.
- Correo electrónico.
- Push móvil.
- WhatsApp solo como botón de acción manual, no como canal automático.

## 70. Limitación del push

Cuotly solicita y recomienda activar push, pero iOS y Android permiten al usuario rechazarlo. La aplicación debe seguir funcionando sin push.

- Onboarding explica su utilidad.
- Si se rechaza, aparece aviso persistente.
- El correo actúa como respaldo.
- Las alertas críticas no pueden desactivarse dentro de Cuotly.
- El sistema operativo siempre conserva el control final.

## 71. Preferencias

- Propietarios reciben todo por defecto.
- Pueden desactivar avisos secundarios.
- Cada usuario configura preferencias individuales según lo permitido.
- Seguridad, pérdida de acceso, impagos graves y vencimientos críticos no se desactivan internamente.

## 72. Reglas operativas

- Nueva solicitud sin asignar: propietario y todos los administradores.
- No se avisa a trabajadores no asignados.
- Asignación: trabajador y supervisores.
- Principal y sustituto reciben alertas cuando corresponda.
- Inicio de trabajo: visible dentro de Cuotly para cliente, sin push o correo.
- Publicación: cliente y supervisión correspondiente.
- Cuotas: avisos al 80 % y 100 %.
- Plazo de inicio interno: avisos al 50 %, 80 % y 100 %.
- Ejecución interna: avisos al 75 %, 90 % y 100 %.
- No hay recordatorio de expiración de corrección.
- Menú Diario: recordatorio 20:00 si falta el del día siguiente.
- El icono móvil muestra el número de avisos pendientes.
- WhatsApp puede aparecer como botón manual para acciones como solicitar cambios adicionales, sin mensajes automáticos enviados por Cuotly.

## 73. Deep links

Push y avisos internos abren el elemento exacto. Si pertenece a otro contexto, Cuotly verifica acceso, cambia de espacio o establecimiento y navega al destino.

## 74. Agente Cuotly

En la etapa inicial:

- aparece en escritorio al final de la barra lateral, antes de Ajustes;
- en móvil aparece dentro de Más;
- muestra `Próximamente`;
- al pulsarlo informa que todavía no está disponible;
- no consume IA;
- no genera resúmenes;
- no se simula funcionalidad falsa.

En el futuro abrirá panel lateral en escritorio y pantalla completa en móvil. Su definición funcional se ha aplazado expresamente.

---

# PARTE XIII — CALENDARIO

## 75. Calendario operativo

Existe un calendario por espacio con filtros por:

- establecimiento;
- grupo;
- trabajador;
- tipo de evento;
- estado.

Propietario y administradores ven el completo. El trabajador ve trabajos, tareas y establecimientos autorizados. El restaurante solo ve eventos propios y nunca organización interna o ausencias del equipo.

## 76. Eventos automáticos

- Límite para comenzar.
- Límite de ejecución.
- Fin de corrección.
- Publicaciones de Menú Diario.
- Renovaciones de planes y servicios.
- Final de sustituciones.
- Fin de solo lectura.

Las fechas exactas internas de SLA no se muestran al restaurante; se mantienen rangos amigables.

## 77. Eventos manuales y ausencias

- Propietario y administradores crean eventos, recordatorios y bloqueos.
- Trabajadores crean recordatorios personales y relacionados con sus trabajos.
- El trabajador solicita ausencia.
- Propietario o administrador la aprueba.
- Durante ausencia no se recomienda ni autoasigna.
- Si deja trabajos sin cobertura, se avisa para reasignar o para que propietario/administrador los asuma.

## 78. Configuración de calendario

Cada espacio configura:

- zona horaria;
- horario laboral;
- festivos;
- cierres excepcionales;
- horarios especiales.

Restavor utiliza Europa/Madrid y el reloj contractual ya definido. Los festivos aplicables son los del lugar en que trabaja el proveedor, no los del restaurante, salvo configuración contractual distinta.

## 79. Vistas y sincronización

- Mes.
- Semana.
- Agenda.
- Agenda como vista principal móvil.
- Exportación o suscripción hacia Google Calendar, Apple Calendar y Outlook.
- Inicialmente el flujo es desde Cuotly hacia el calendario externo.
- La sincronización bidireccional queda preparada para futuro por el riesgo de conflictos.

---

# PARTE XIV — FINANZAS Y COBROS DE LOS RESTAURANTES

## 80. Alcance

Cuotly funciona inicialmente como control financiero operativo. No procesa pagos de restaurantes ni sustituye un sistema contable oficial.

Registra:

- cuotas;
- presupuestos;
- cobros;
- vencimientos;
- justificantes;
- facturas emitidas externamente;
- impagos;
- reembolsos.

## 81. Generación de mensualidades

La mensualidad se genera automáticamente en la fecha de renovación según plan, impuestos y condiciones vigentes.

Estados:

- Pendiente.
- Pagado.
- Pagado parcialmente.
- Vencido.
- Perdonado / Anulado.
- Reembolsado.

Métodos registrados:

- transferencia;
- tarjeta;
- efectivo;
- domiciliación;
- otro.

## 82. Confirmación de pago

Propietario y administradores pueden confirmar, corregir y gestionar cobros.

Un trabajador puede marcar **Pagado** desde la ficha de un restaurante asignado sin acceder al módulo Finanzas.

Limitaciones del trabajador:

- solo establecimientos asignados;
- indica fecha, importe y método;
- puede adjuntar justificante;
- no cambia precio;
- no perdona deuda;
- no reembolsa;
- no ve ingresos globales;
- su acción queda auditada.

El restaurante puede subir justificante, pero la confirmación corresponde a propietario, administrador o trabajador autorizado.

## 83. Visibilidad financiera del cliente

- Propietario global: grupo completo.
- Propietario local: su establecimiento.
- Editor: solo con permiso `Ver facturación`.
- Consulta: sin acceso.

Se muestran base imponible, impuesto y total. Restavor utiliza inicialmente IVA del 21 %, mientras otros espacios configuran sus impuestos.

## 84. Presupuestos adicionales

Estados:

1. Borrador.
2. Enviado.
3. Aceptado o Rechazado.
4. Pendiente de pago.
5. Pagado.

Tras aceptación se crea solicitud o trabajo sin consumir bolsa. Puede exigirse pago previo o autorizar inicio antes del pago. La autorización queda registrada.

## 85. Impago del restaurante a su proveedor

- +24 horas naturales desde vencimiento: establecimiento Pausado por impago.
- +72 horas naturales: servicio cancelado y establecimiento Suspendido por impago.
- Se detienen trabajos, publicaciones y contadores.
- No se borra información.
- Al confirmarse pago se reactiva y los contadores siguen con tiempo restante.
- La pausa financiera queda auditada.

## 86. Panel financiero

- Ingresos mensuales previstos.
- Ingresos cobrados.
- Pendientes y vencidos.
- Ingreso recurrente mensual.
- Ingresos por plan.
- Ingresos por trabajos adicionales.
- Evolución mensual.
- Próximas renovaciones.
- Restaurantes con impago.
- Resumen con y sin IVA.

## 87. Facturas

- Se puede adjuntar factura oficial para descarga.
- Un futuro agente puede preparar un borrador.
- Numeración, impuestos y cálculos deben ser deterministas.
- Inicialmente propietario o administrador revisa antes de emitir.
- El bloque legal y fiscal definitivo está pendiente.

## 88. Suscripción Cuotly visible en el espacio

La factura y datos de Pro o Agency solo los ve el propietario del espacio, no sus administradores.

---


# PARTE XV — INFORMES, ANALÍTICA Y OPORTUNIDADES

## 89. Categorías de informes

1. **Operación:** solicitudes, trabajos, tareas, tiempos, consumos y menús.
2. **Finanzas:** ingresos, cobros, impagos y renovaciones.
3. **Rendimiento digital:** web, Google y fuentes conectadas.

Dentro de la ficha del restaurante, el área de datos puede organizarse en:

1. Resumen.
2. Analítica.
3. Búsqueda.
4. Comportamiento.
5. Rendimiento.
6. Oportunidades.

Propietario y administradores del espacio ven informes globales e individuales. El propietario global de restaurantes ve consolidado y detalle. El propietario local ve su establecimiento. Editor ve informes siempre. Consulta necesita permiso de su propietario.

## 90. Informe personal del trabajador

Incluye:

- carga actual;
- trabajos realizados;
- pendientes;
- cumplimiento de plazos;
- tiempos medios;
- bloqueos;
- correcciones;
- puntos históricos realizados separados de carga actual.

No incluye finanzas. Las comparaciones solo las ven propietario y administradores y se normalizan como se definió en la sección 55.

## 91. Indicadores operativos

- Solicitudes recibidas, aceptadas, rechazadas y canceladas.
- Trabajos iniciados, completados y pendientes.
- Cumplimiento de inicio.
- Cumplimiento de ejecución.
- Tiempo medio de inicio y finalización.
- Trabajos bloqueados y duración bloqueada.
- Correcciones solicitadas.
- Consumo de cambios, fotografías y actualizaciones.
- Menús publicados.
- Menús fuera de garantía.

## 92. Analítica digital

### 92.1 Google Analytics 4

- usuarios;
- sesiones;
- páginas más visitadas;
- procedencia;
- dispositivos;
- ubicaciones aproximadas;
- conversiones configuradas.

Una conversión solo existe si se ha configurado el evento correspondiente: reserva, llamada, WhatsApp, pedido u otro.

### 92.2 Search Console

- clics;
- impresiones;
- CTR;
- posición media;
- búsquedas principales;
- páginas que aparecen en Google.

### 92.3 Otras fuentes

- Google Business Profile.
- Microsoft Clarity.
- PageSpeed Insights.

Las plataformas de reservas, pedidos o delivery no se monitorizan como parte del mantenimiento; solo se registran como herramientas utilizadas.

## 93. Filtros y exportación

Filtros:

- periodo;
- restaurante;
- grupo;
- plan;
- trabajador;
- tipo de cambio;
- estado;
- servicio.

Salidas:

- pantalla;
- PDF;
- CSV;
- correo programado.

El informe automático por correo no necesita IA.

## 94. Conservación histórica

- Los datos ya importados se conservan aunque cambie el plan o se desconecte la fuente.
- Se indica fecha de última sincronización.
- Nunca se presenta información desactualizada como actual.

## 95. Generación y aprobación de informes

Estados:

- Preparando.
- Pendiente de revisión.
- Aprobado.
- Programado.
- Enviado.
- Archivado.

Flujo:

1. Cuotly genera datos objetivos automáticamente.
2. Prepara borrador.
3. Muestra las secciones que requieren criterio.
4. Propietario o administrador con `Aprobar informes` revisa.
5. Selecciona, edita y ordena.
6. Cuotly inserta automáticamente lo aprobado.
7. Genera PDF, programa o envía.

- Informes solo objetivos pueden enviarse automáticamente.
- Si hay oportunidades pendientes, no se envía hasta aprobación.
- Cuotly avisa cuando se acerca la fecha programada.
- Cada versión se conserva.

## 96. Oportunidades automáticas

Cuotly aplica reglas a datos de GA4, Search Console, Business Profile, Clarity y PageSpeed sin necesidad de IA.

Ejemplos:

- descenso significativo de tráfico;
- CTR bajo;
- pérdida de posición;
- lentitud;
- imágenes pesadas;
- error técnico;
- baja conversión móvil;
- búsquedas relevantes sin contenido adecuado;
- poco uso de botones importantes.

Cada oportunidad muestra:

- título;
- categoría;
- evidencia;
- periodo;
- prioridad propuesta;
- impacto esperado;
- esfuerzo estimado;
- acción recomendada;
- servicio o cambio potencial;
- opción Incluir en informe.

No debe afirmarse algo sin evidencia suficiente. Impacto, prioridad o esfuerzo son propuestas editables.

## 97. Oportunidades manuales y participación del equipo

Existe **Añadir oportunidad**.

El trabajador asignado puede:

- ver oportunidades automáticas;
- añadir una manual;
- aportar evidencia;
- recomendar inclusión;
- añadir observaciones.

No puede aprobarla definitivamente.

Propietario y administradores con `Aprobar informes` pueden editar, ordenar, aprobar o descartar.

## 98. Estados de oportunidad

- Detectada.
- Recomendada.
- En revisión.
- Aprobada para informe.
- Descartada.
- En ejecución.
- Implementada.
- Ya no aplicable.

## 99. Persistencia, duplicados y reaparición

- Detecciones repetidas actualizan la oportunidad existente.
- Una aprobada permanece disponible mientras siga vigente.
- En cada informe se vuelve a decidir si se incluye.
- Una descartada conserva historial.
- Puede reaparecer si empeora o vuelve a cumplirse en otro periodo, indicando el descarte anterior.

## 100. Acción del restaurante sobre una oportunidad

Opciones:

- Solicitar esta mejora.
- Pedir presupuesto.
- Hacer una pregunta al equipo.

La acción crea borrador de solicitud con evidencia adjunta. Después sigue análisis, aceptación, consumo o presupuesto normal.

## 101. Oportunidades según plan Restavor

- Básico: detección interna; no inclusión automática en informe.
- Impulso: oportunidades básicas aprobadas.
- Premium: oportunidades avanzadas aprobadas.

Un futuro Agente Cuotly podrá resumir o explicar oportunidades consumiendo IA, pero no forma parte del sistema actual de reglas.

---

# PARTE XVI — PLANES Y SERVICIOS CONFIGURABLES

## 102. Permisos

- Solo propietario crea, modifica o archiva planes.
- Administradores pueden asignar planes existentes a restaurantes.

## 103. Campos de plan

- nombre;
- descripción;
- precio sin impuestos;
- impuesto;
- periodicidad;
- permanencia;
- categorías y consumos;
- fotografías;
- SLA de inicio;
- prioridad;
- servicios incluidos;
- condiciones;
- límites;
- acceso a informes o analítica.

Otros espacios pueden crear categorías propias y periodicidades mensuales, trimestrales, semestrales o anuales.

## 104. Versionado de planes

- Editar un plan contratado crea una versión nueva.
- El plan anterior puede archivarse para nuevas altas.
- Los clientes existentes migran en la siguiente renovación o fecha programada.
- Cambios generales se avisan con mínimo 30 días naturales.
- Se conserva versión aceptada.
- Si el cambio importante requiere aceptación, Cuotly la solicita.

## 105. Asignación y precio

- Un establecimiento tiene un plan de mantenimiento activo.
- Puede tener varios servicios adicionales.
- No se permiten precios negociados individuales para los planes de Restavor.
- Otros espacios aplicarán sus reglas, pero Cuotly no fomenta negociación oculta.

## 106. Cambio de plan Restavor

### Mejora inmediata

- diferencia económica proporcional;
- consumos adicionales proporcionales al periodo restante;
- no duplica lo ya utilizado;
- nuevo SLA solo para solicitudes posteriores;
- nueva permanencia de 3 meses.

### Mejora en renovación

- nuevo plan y bolsa completa en la fecha de renovación;
- nueva permanencia de 3 meses.

### Reducción

- solo en renovación;
- después de cumplir permanencia vigente;
- sin reembolso;
- consumos sobrantes desaparecen;
- nueva permanencia de 3 meses;
- trabajos aceptados conservan condiciones.

## 107. Servicios adicionales

Cada espacio puede crear servicios con:

- precio;
- periodicidad;
- impuestos;
- consumos;
- condiciones;
- responsables;
- calendarios;
- estados;
- reglas de cancelación.

Menú Diario utiliza esta estructura, con sus reglas específicas.

---

# PARTE XVII — ARCHIVOS Y DOCUMENTOS

## 108. Categorías

- Logos.
- Fotografías.
- Menús.
- Textos y documentos.
- Informes.
- Facturación.
- Solicitudes y trabajos.
- Otros.

Cada archivo registra nombre, categoría, espacio, grupo, establecimiento, elemento relacionado, usuario, fecha, tamaño y formato.

## 109. Versiones

- Sustituir crea una nueva versión.
- La anterior permanece.
- En fotografía se separan original, retocada y publicada.
- Un cliente puede marcar Archivo principal.

## 110. Permisos

- Propietario/administradores: todo el espacio según sensibilidad.
- Trabajador: archivos operativos de establecimientos asignados.
- Propietario del restaurante: compartidos de sus establecimientos.
- Editor: compartidos de establecimientos asignados.
- Consulta: solo los autorizados.
- Facturación nunca visible para trabajadores.

Cada archivo se marca **Interno** o **Compartido con el restaurante**. Un trabajador puede compartir posteriormente uno interno y queda auditado.

## 111. Conservación y eliminación

- Adjuntos de mensajes no se eliminan.
- Otros archivos se archivan, no se borran inmediatamente.
- Solo propietario puede solicitar borrado definitivo cuando no esté vinculado a operación, factura, aceptación o registro obligatorio.
- Se permite selección múltiple, ZIP y exportación por establecimiento.
- Se detectan duplicados binarios para ahorrar almacenamiento sin perder sus relaciones.

## 112. Seguridad de archivos

- Máximo inicial: 25 MB por archivo.
- Imágenes, PDF, Word, Excel y texto.
- Vídeos no permitidos.
- Ejecutables y formatos peligrosos bloqueados.
- Comprobación de seguridad previa.
- Enlaces privados y temporales.
- Optimización visual conservando original.

## 113. Almacenamiento

- Pro: 20 GB.
- Agency: 100 GB.
- Avisos al 80 % y 100 %.
- Almacenamiento adicional: futuro; precio pendiente.
- “Ilimitado” en Agency no incluye almacenamiento ilimitado.

## 114. Evidencia externa

Cuotly conserva el archivo o evidencia publicado, pero no garantiza que una plataforma externa lo mantenga disponible.

---

# PARTE XVIII — INTEGRACIONES

## 115. Integraciones analíticas

Por establecimiento:

- GA4.
- Search Console.
- Business Profile.
- Clarity.
- PageSpeed.

Un propietario global puede autorizar varios establecimientos.

## 116. Conexión

- OAuth cuando exista.
- Clave API solo cuando sea necesaria.
- Credenciales y tokens cifrados.
- Contraseñas nunca visibles.
- Botón de comprobación.

El propietario del restaurante puede autorizar una cuenta que le pertenezca. El propietario del espacio gestiona la integración sin ver su contraseña.

## 117. Estados

- No conectada.
- Pendiente de autorización.
- Conectada.
- Sincronizando.
- Requiere atención.
- Error.
- Desconectada.

Se muestra cuenta, establecimiento, última sincronización, siguiente intento y error. No existe botón Sincronizar ahora para no crear expectativa de inmediatez.

## 118. Frecuencias

- Analítica y Search Console: diaria.
- PageSpeed: semanal y cuando el sistema lo programe.
- Otros datos: frecuencia adaptada.

Cuotly conserva último dato válido, lo marca como desactualizado si falla y reintenta. Propietario y administradores reciben aviso; el propietario del restaurante solo si debe autorizar de nuevo.

## 119. Permisos y terminación

- Trabajadores autorizados consultan lo necesario.
- No conectan, desconectan ni ven credenciales.
- Al suspenderse definitivamente el mantenimiento se revocan autorizaciones externas.
- Los datos históricos importados permanecen.
- Toda conexión, desconexión y error queda auditado.

## 120. Plataformas de reservas, pedidos y delivery

No son integraciones monitorizadas de Cuotly.

- Se puede indicar cuáles usa el restaurante y sus enlaces.
- Puede haber varias.
- No existe sección de control de su funcionamiento.
- El equipo garantiza que el enlace, botón o componente que instaló en la web esté correctamente implementado.
- Un error de implementación propio se corrige gratuitamente.
- Una caída o fallo de la plataforma externa no es responsabilidad del equipo y no consume la corrección gratuita.

## 121. LandingSite

- Se registra como plataforma web.
- Se guarda enlace, proyecto, estado y última publicación.
- La publicación de Menú Diario es manual.
- No se simula una API inexistente.

## 122. Costes externos

Dominios, reservas, delivery, herramientas y otros servicios externos corresponden al restaurante o al proveedor de mantenimiento según su contrato. No están incluidos automáticamente en Cuotly.

---


# PARTE XIX — AJUSTES, ADMINISTRACIÓN Y SOPORTE

## 123. Secciones de Ajustes

- Mi cuenta.
- Notificaciones.
- Apariencia.
- Espacio de mantenimiento.
- Horario y calendario.
- Facturación e impuestos.
- Integraciones.
- Seguridad.
- Suscripción a Cuotly.
- Auditoría.
- Exportación y conservación.

Cada usuario solo ve lo permitido.

## 124. Identidad visual del espacio

- Puede cambiar nombre y logotipo.
- No puede cambiar paleta, estructura base ni eliminar `Cuotly · by Restavor`.
- Un único sistema visual: Emerald Control.
- Un único modo claro inicialmente.
- Sin selector de densidad: densidad cómoda única.

## 125. Configuración contractual

Solo propietario cambia:

- reloj de SLA;
- zona horaria contractual;
- permanencias;
- impuestos;
- reglas de consumo.

Propietario y administradores gestionan festivos, cierres y horarios especiales con auditoría.

## 126. Credenciales de integraciones

- Propietario y administradores pueden gestionar conexiones.
- Solo propietario introduce, sustituye o elimina credenciales sensibles.
- Trabajadores nunca las ven.

## 127. Propiedad y eliminación de espacio

- Solo propietario transfiere propiedad.
- Siempre debe existir al menos un propietario.
- Solo propietario archiva o solicita eliminación.
- Primero se archiva.
- Recuperable durante 30 días.
- Después se programa eliminación.
- Registros legales se tratan según la futura revisión jurídica.

## 128. Panel de Administración de Cuotly

Muestra:

- usuarios;
- espacios;
- solicitudes de alta;
- suscripciones;
- ingresos;
- pruebas activas;
- impagos;
- almacenamiento;
- actividad;
- incidencias;
- soporte;
- auditoría.

## 129. Modo soporte

Bosco o Administrador de Cuotly autorizado puede entrar en un espacio ajeno solo mediante Modo soporte.

Requisitos:

- motivo obligatorio;
- identidad visible en auditoría;
- fecha y hora;
- duración;
- acciones realizadas;
- mínimo privilegio necesario.

## 130. Soporte al restaurante

El restaurante ve **Contactar con el equipo de mantenimiento**.

- Llega a propietario y administradores del espacio.
- Trabajadores asignados pueden participar.
- El cliente nunca ve nombres individuales.

## 131. Soporte de Cuotly

- Solo propietario y administradores del espacio crean incidencias para Cuotly.
- Trabajadores y clientes consultan artículos, pero no contactan directamente con Bosco.
- Pro: soporte estándar.
- Agency: prioridad superior.
- Incidencias críticas tienen prioridad independientemente del plan.
- No existe inicialmente un tiempo contractual de respuesta público.

Estados:

- Abierta.
- En revisión.
- Necesita información.
- En proceso.
- Resuelta.
- Cerrada.

Campos:

- categoría;
- descripción;
- capturas;
- archivos;
- dispositivo;
- versión;
- impacto.

Cuotly puede recoger navegador, sistema, pantalla y error no sensible informando al usuario.

## 132. Horario humano de soporte e incidencias

Zona: Europa/Madrid.

- Lunes–viernes: 14:00–22:00.
- Sábados: 09:00–14:30 y 16:30–21:30.
- Domingos: 09:00–14:30 y 16:30–21:30.
- Festivos: horario de fin de semana.
- Las incidencias pueden enviarse a cualquier hora.
- El tiempo de atención solo cuenta dentro de las franjas.

Este horario no modifica el reloj contractual de trabajos.

## 133. Centro de ayuda y estado

- Buscador y guías por rol.
- Primeros pasos, solicitudes, trabajos, menús, pagos, usuarios, integraciones y seguridad.
- Una búsqueda sin solución puede convertirse en incidencia conservando contexto.
- Sugerencias de funciones separadas de errores.
- Página de estado para aplicación, autenticación, archivos, notificaciones e integraciones.

---

# PARTE XX — SEGURIDAD, PRIVACIDAD Y AUDITORÍA

## 134. Aislamiento multiempresa

- Cada dato pertenece a un espacio y, cuando corresponda, a grupo y establecimiento.
- Ningún usuario accede a otro espacio salvo soporte autorizado.
- El aislamiento se aplica en base de datos mediante políticas, no solo en la interfaz.

## 135. Ubicación y cifrado

- Se prioriza alojamiento en la Unión Europea.
- Tráfico cifrado.
- Contraseñas, tokens, códigos y credenciales no se guardan en texto visible.
- Secretos solo en almacenes seguros del servidor.

## 136. Autenticación en dos pasos

- Obligatoria para Bosco.
- Obligatoria para Administradores de Cuotly.
- Muy recomendada, inicialmente opcional, para propietarios y administradores de espacios.
- Opcional para trabajadores y clientes.

## 137. Protección de cuenta

- Sesiones y dispositivos visibles.
- Cierre remoto.
- Avisos por dispositivos nuevos y cambios sensibles.
- Límites temporales ante intentos fallidos.
- Verificación adicional cuando exista riesgo.
- Al cerrar sesión o perder acceso, el dispositivo deja de recibir push y pierde datos temporales.

## 138. Copias de seguridad de Cuotly

- Automáticas y diarias.
- Cifradas.
- Conservación objetivo de 30 días.
- Capacidad de restauración ante error grave.
- Separadas conceptualmente de los backups de las webs de los restaurantes.

## 139. Auditoría

Registra como mínimo:

- accesos sensibles;
- roles y permisos;
- supervisores;
- asignaciones;
- consumos;
- pagos;
- plazos;
- publicaciones;
- exportaciones;
- archivos;
- credenciales;
- soporte;
- eliminaciones;
- correcciones manuales.

Visibilidad:

- propietario del espacio: completa de su espacio;
- administradores: operativa, sin acciones privadas reservadas;
- propietario de restaurante: su establecimiento;
- trabajadores y Editores: acciones propias y operaciones autorizadas.

Los registros de auditoría no se editan ni eliminan desde la aplicación, ni siquiera por Bosco.

## 140. Acciones sensibles

Roles, permisos, planes, consumos, pagos, SLA, credenciales, propiedad y eliminación requieren confirmación adicional.

Una corrección manual conserva:

- motivo;
- autor;
- fecha;
- valor anterior;
- valor nuevo.

## 141. Exportación y cuenta personal

- Propietario del espacio exporta todo su espacio.
- Propietario de restaurante exporta grupo o establecimientos propios.
- Un usuario no puede eliminar su cuenta si es único propietario de un espacio o grupo.
- Primero transfiere propiedad o cierra entidades.

## 142. Incidentes de seguridad

Cuotly identifica espacios y usuarios potencialmente afectados, conserva evidencia, permite revocar sesiones y facilita comunicación. El procedimiento jurídico exacto se definirá en el bloque legal.

---

# PARTE XXI — APLICACIONES, DISEÑO Y ACCESIBILIDAD

## 143. Canales de producto

- Aplicación web completa.
- Aplicación móvil iOS.
- Aplicación móvil Android.
- Adaptación a tabletas.
- Misma cuenta, reglas y datos.
- Todas las funciones disponibles en móvil y escritorio.
- Flujos complejos adaptados al móvil, no eliminados.

## 144. Trabajo sin conexión

Sin conexión se puede:

- consultar información reciente almacenada temporalmente;
- redactar borradores de solicitudes y mensajes.

Al volver la conexión:

- se pide confirmación antes de enviar borradores;
- pagos, aceptaciones, consumos, publicaciones y completados requieren servidor;
- nunca se duplica una acción.

## 145. Permisos móviles

- Cámara y selección de fotografías.
- Escaneo de documentos.
- No ubicación.
- No micrófono.
- No contactos.
- No vídeos.
- Desbloqueo mediante biometría después de iniciar sesión.

## 146. Identidad visual Emerald Control

### Colores base

- Primary Dark: `#0B2F2A`.
- Primary: `#145C4E`.
- Cuotly Green: `#1D8A6A`.
- Accent Green: `#32B889`.
- Background: `#F5F7F4`.
- Surface: `#FFFFFF`.
- Soft Surface: `#EAF0EC`.
- Main Text: `#17211F`.
- Secondary Text: `#66736E`.
- Border: `#DDE5E1`.

### Estados

- Success: `#168A6D`.
- Warning: `#D89524`.
- Danger: `#C84C4C`.
- Info: `#3976D4`.

### Tipografía

Inter.

## 147. Accesibilidad y usabilidad

- Objetivo mínimo WCAG AA.
- Contraste suficiente.
- Navegación por teclado.
- Foco visible.
- Etiquetas para lectores de pantalla.
- Áreas táctiles adecuadas.
- Estado expresado con texto e icono, no solo color.
- Respeto al zoom y tamaño de texto del dispositivo.
- Sin selector propio de tamaño.
- Reducción de movimiento cuando el sistema lo solicita.
- Una única densidad cómoda.
- Sin modo oscuro inicial.

## 148. Formularios y estados de interfaz

- Autoguardado de formularios largos.
- Contenido conservado si falla el envío.
- Confirmaciones descriptivas.
- Estados de carga.
- Estado sin datos.
- Error.
- Sin conexión.
- Sin permisos.
- Paginación o carga progresiva.
- Acciones principales accesibles en móvil.

## 149. Lenguaje y fechas

- Español inicialmente.
- Arquitectura preparada para inglés futuro.
- Lenguaje sencillo para clientes.
- Lenguaje operativo para equipo.
- Sin códigos técnicos visibles.
- Fechas en zona del espacio.
- Aviso si usuario se encuentra en otra zona.

## 150. Publicidad

Cuotly no incluye anuncios ni promociones invasivas.

---

# PARTE XXII — ARQUITECTURA TÉCNICA

## 151. Stack acordado

| Componente | Base |
|---|---|
| Web | Next.js + TypeScript |
| Hosting web | Vercel |
| Móvil | React Native + Expo |
| Base de datos | PostgreSQL en Supabase |
| Autenticación | Supabase Auth |
| Archivos | Supabase Storage |
| Tiempo real | Supabase Realtime |
| Tareas programadas | Supabase Cron |
| Colas y reintentos | Supabase Queues |
| Push | Expo Notifications sobre FCM/APNs |
| Correo | Resend |
| Pagos | Transferencia/Bizum manual |
| Monitorización | Servicio externo de errores y disponibilidad |

## 152. Principios técnicos

- Un único backend multiempresa.
- No crear proyecto o base por restaurante.
- PostgreSQL estándar como núcleo.
- Políticas RLS para aislamiento.
- Cálculos de consumo, permisos, pagos y contadores en servidor.
- Cliente web/móvil nunca es autoridad final.
- Capa de servicios propia para reducir dependencia de proveedores.
- Entornos separados: desarrollo, pruebas y producción.
- Datos reales no se copian libremente a pruebas.
- Agente Cuotly fuera de arquitectura inicial.

### 152.1 Modelo conceptual de datos

El esquema físico se diseñará al definir versiones, pero debe representar como mínimo estas entidades:

#### Plataforma

- usuarios;
- perfiles;
- identidades de acceso;
- solicitudes de espacios;
- espacios de mantenimiento;
- membresías de espacios;
- suscripciones Pro/Agency;
- pagos de Cuotly;
- Administradores de Cuotly;
- sesiones de Modo soporte.

#### Clientes

- grupos;
- establecimientos;
- membresías de grupo;
- membresías de establecimiento;
- roles y permisos específicos;
- transferencias entre espacios.

#### Comercial

- planes;
- versiones de plan;
- servicios;
- versiones de servicio;
- suscripciones de establecimientos;
- ciclos de consumo;
- movimientos del libro de consumos;
- presupuestos;
- aceptaciones.

#### Operación

- solicitudes;
- versiones de solicitud;
- clasificaciones propuestas y aprobadas;
- trabajos;
- tareas;
- asignaciones;
- supervisores y sustituciones;
- eventos de estado;
- eventos de temporizador;
- bloqueos y pausas;
- correcciones;
- puntos de carga.

#### Menú Diario

- menús;
- versiones;
- plantillas;
- solicitudes de publicación;
- publicaciones;
- movimientos de actualizaciones.

#### Comunicación y archivos

- conversaciones;
- participantes;
- mensajes;
- ediciones de mensajes;
- notas internas;
- archivos;
- versiones de archivo;
- relaciones entre archivos y entidades.

#### Finanzas

- cargos;
- vencimientos;
- pagos;
- confirmaciones;
- justificantes;
- facturas adjuntas;
- reembolsos.

#### Datos e informes

- conexiones externas;
- ejecuciones de sincronización;
- series de métricas;
- informes;
- versiones de informe;
- oportunidades;
- evidencia y decisiones sobre oportunidades.

#### Sistema

- notificaciones;
- preferencias;
- dispositivos y tokens push;
- correos y reintentos;
- eventos de calendario;
- festivos;
- incidencias de soporte;
- auditoría.

### 152.2 Reglas estructurales de datos

- Identificadores internos globalmente únicos y códigos humanos cuando aporten valor.
- `space_id` obligatorio en toda entidad perteneciente a un espacio.
- `establishment_id` cuando el dato sea específico de restaurante.
- Movimientos financieros y de consumo mediante libro inmutable, no solo un número editable.
- Estados derivados, como Fuera de plazo, calculados a partir de eventos fiables.
- Borrado lógico o archivado antes de eliminación física.
- Versiones para contratos, planes, mensajes editados, menús, solicitudes, informes y archivos.
- Timestamps de servidor y zona horaria explícita.
- Operaciones críticas dentro de transacciones.

### 152.3 Referencias técnicas primarias

- [Seguridad y RLS de Supabase](https://supabase.com/docs/guides/database/secure-data).
- [Supabase Cron](https://supabase.com/docs/guides/cron).
- [Supabase Queues](https://supabase.com/docs/guides/queues).
- [Notificaciones push de Expo](https://docs.expo.dev/push-notifications/overview/).
- [Next.js en Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
- [Correo transaccional con Resend](https://resend.com/docs/introduction).
- [Normas de revisión de Apple](https://developer.apple.com/app-store/review/guidelines/).

## 153. Procesamiento asíncrono

Colas con idempotencia y reintentos para:

- push;
- correos;
- informes programados;
- recordatorios;
- sincronizaciones;
- tareas de archivos;
- eventos de auditoría secundarios.

El fallo de una notificación no revierte la operación principal.

## 154. Tiempo y zonas horarias

- Fechas persistidas en formato temporal inequívoco.
- Cálculos según zona del espacio.
- Cambios verano/invierno automáticos.
- Calendarios laborales versionados.
- Un cambio de calendario no modifica retroactivamente contadores activos salvo corrección auditada.

## 155. Portabilidad

- Evitar lógica crítica exclusiva de Vercel o Supabase cuando exista alternativa razonable.
- Separar almacenamiento, correo, push y trabajos mediante interfaces internas.
- Mantener migraciones de base de datos versionadas.
- No autoalojar inicialmente solo por ahorrar una cantidad pequeña, porque añade seguridad, backups y operación.

---

# PARTE XXIII — RENDIMIENTO Y CONTINUIDAD

## 156. Objetivos internos

- Disponibilidad técnica objetivo: 99,9 % mensual.
- No es garantía contractual inicial.
- No se muestra como promesa al restaurante.
- Pantallas habituales con respuesta perceptible inferior a 2 s como objetivo.
- Información principal inferior a 3 s con conexión móvil normal como objetivo.
- Informes pesados muestran progreso y no bloquean la aplicación.

## 157. Monitorización

- Automática y permanente.
- Alerta crítica a Bosco y Administradores de Cuotly.
- No implica soporte humano 24/7.
- Página de estado pública con componentes e historial de incidencias relevantes.

## 158. Mantenimiento y despliegues

- Aviso con 48 horas para mantenimiento planificado.
- Excepción para seguridad urgente.
- Página informativa durante mantenimiento.
- Entorno de pruebas.
- Pruebas automáticas de permisos, consumos, contadores, pagos, asignaciones y estados.
- Capacidad de volver a versión anterior sin perder datos nuevos.
- Actualizaciones móviles obligatorias solo por seguridad o incompatibilidad grave.

## 159. Compatibilidad

- Navegadores y sistemas modernos con actualizaciones de seguridad.
- No se garantiza soporte a dispositivos obsoletos.

---

# PARTE XXIV — REGLAS DE CONSISTENCIA Y CASOS LÍMITE

## 160. Operaciones únicas

- Solo una solicitud puede consumir el último crédito disponible.
- Pulsaciones repetidas no duplican aceptación, publicación, pago, completado o notificaciones.
- Las operaciones críticas utilizan identificadores idempotentes y transacciones.

## 161. Renovación con trabajos activos

- El trabajo continúa.
- El consumo permanece en el periodo de aceptación.
- La corrección sigue vinculada al trabajo aunque cambie el ciclo o plan.

## 162. Edición simultánea

- No sobrescribir silenciosamente.
- Detectar versión anterior.
- Avisar del conflicto.
- Permitir comparar o reconciliar.

## 163. Fallos de conexión y sincronización

- Indicar si una acción se completó.
- Reintentar solo operaciones seguras.
- Conservar último dato externo válido con marca de antigüedad.
- Registrar error sin secretos ni contenido privado innecesario.

## 164. Pérdida de responsable

- Si un trabajador se desactiva, pierde acceso o entra en ausencia, Cuotly alerta sobre trabajos pendientes.
- Reasignar no reinicia contadores.
- Propietario/administrador puede asumir.

## 165. Reactivación tras impago

- Solicitudes, trabajos y contadores siguen exactamente donde se pausaron.
- No se duplican.
- Se registra reactivación y pago.

## 166. Correcciones manuales

Toda corrección de consumo, pago, plazo, asignación o estado exige motivo y conserva valor anterior y nuevo.

---

# PARTE XXV — MATRIZ RESUMIDA DE PERMISOS

## 167. Plataforma

| Acción | Bosco | Admin Cuotly |
|---|:---:|:---:|
| Aprobar espacios | Sí | Si recibe permiso |
| Gestionar suscripciones | Sí | Si recibe permiso |
| Modo soporte | Sí | Si recibe permiso |
| Nombrar Admin Cuotly | Sí | No |
| Transferir propiedad plataforma | Sí | No |
| Eliminar plataforma | No desde operación ordinaria | No |

## 168. Espacio de mantenimiento

| Acción | Propietario | Administrador | Trabajador |
|---|:---:|:---:|:---:|
| Invitar trabajador | Sí | No | No |
| Nombrar administrador | Sí | No | No |
| Crear establecimiento | Sí | Sí | No |
| Crear/modificar plan | Sí | No | No |
| Asignar plan existente | Sí | Sí | No |
| Ver finanzas globales | Sí | Sí | No |
| Marcar pago | Sí | Sí | Solo restaurante asignado |
| Aprobar informe | Sí | Con permiso | No |
| Proponer oportunidad | Sí | Sí | Sí, asignados |
| Ejecutar trabajo | Solo si hace falta | Con capacidad | Sí |
| Cambiar SLA contractual | Sí | No | No |
| Gestionar festivos | Sí | Sí | No |
| Ver credenciales | Solo gestión segura | No secreto completo | No |

## 169. Restaurante

| Acción | Prop. global | Prop. local | Editor | Consulta |
|---|:---:|:---:|:---:|:---:|
| Ver establecimientos | Todos grupo | El suyo | Asignados | Asignados |
| Crear solicitud | Sí | Sí | Sí | No |
| Ver informes | Sí | Sí | Sí | Con permiso |
| Ver facturación | Sí | Sí | Con permiso | No |
| Editar datos de ficha | Sí | Sí | Con permiso | No |
| Responder mensajes | Sí | Sí | Sí | No |
| Invitar Editor/Consulta | Sí | Sí | En asignados | No |

---

# PARTE XXVI — PENDIENTES DELIBERADOS Y FUERA DE ALCANCE

## 170. Pendiente deliberadamente

### 170.1 Legal

Se definirá más adelante por decisión de Bosco:

- prestador contractual exacto;
- términos de uso;
- privacidad;
- tratamiento de datos;
- contratos entre espacios y restaurantes;
- validez de aceptaciones;
- retenciones legales;
- fiscalidad de facturas;
- legislación y jurisdicción.

Antes del lanzamiento debe revisarlo un profesional cualificado.

### 170.2 Agente Cuotly

- funciones;
- modelo;
- herramientas;
- permisos;
- créditos;
- precios;
- límites de gasto;
- automatizaciones.

Solo existe el placeholder visual.

### 170.3 API y webhooks

Futuro de Agency. No se desarrollan ahora.

### 170.4 Almacenamiento adicional

Se admite como futuro extra, pero su precio no está fijado.

### 170.5 Fórmulas y umbrales a calibrar

- fórmula matemática de recomendación de trabajador;
- categoría de tareas mayores de 4 horas;
- umbrales concretos de oportunidades;
- definición de impacto y esfuerzo;
- sincronización bidireccional de calendarios.

## 171. Fuera de alcance actual

- Nóminas.
- Contratos laborales.
- Fichaje horario.
- Recursos humanos.
- Retoque fotográfico avanzado.
- Producción fotográfica.
- Monitorización operativa de reservas o delivery.
- Automatización real de LandingSite.
- Chat privado cliente–trabajador.
- Vídeos en archivos.
- Eliminación de mensajes.
- Personalización de colores o white label.
- Modo oscuro.
- Publicidad.
- Cobro automático con Stripe.

---

# PARTE XXVII — DECISIONES OBSOLETAS QUE NO DEBEN REAPARECER

## 172. Lista de sustituciones

- Cuotly no es solo el espacio de Restavor: es multiempresa.
- Se habla de espacios de mantenimiento en general.
- Menú Diario tiene 30 actualizaciones, no 25.
- Menú Diario cuesta 229 € + IVA; Premium paga 199 € + IVA.
- Permanencia de mantenimiento: 3 meses.
- Básico 99 €, Impulso 399 €, Premium 599 € + IVA.
- Básico no incluye ningún cambio ni fotografía.
- No hay bolsas de horas.
- Supervisor no es rol; es relación Admin–Trabajador.
- El supervisor no aprueba antes de publicar.
- El reloj contractual empieza lunes 09:00, no lunes 00:00.
- El soporte humano usa otro horario distinto.
- El cliente no ve empleados individuales.
- Mensajes se editan 10 minutos, no 15.
- Mensajes no se eliminan.
- Menú Diario no requiere botón Comenzar.
- Reservas y delivery no tienen sección de monitorización.
- No existe botón Sincronizar ahora para integraciones analíticas.
- No se usa Stripe inicialmente.
- La aplicación móvil no es una versión reducida.
- Push se recomienda y respalda, pero no puede ser requisito técnico absoluto.
- No se crean bases de datos separadas por restaurante.

---

# PARTE XXVIII — CRITERIOS GENERALES DE ACEPTACIÓN

## 173. Seguridad de acceso

Una función no está terminada si solo se oculta visualmente. Debe probarse que un usuario sin permiso tampoco puede ejecutarla mediante URL, API o manipulación del cliente.

## 174. Integridad financiera y de consumo

- No existen consumos duplicados.
- Toda corrección se audita.
- Los periodos se conservan.
- Los pagos manuales identifican confirmador.
- La reactivación no crea deuda o trabajo duplicado.

## 175. Integridad temporal

- Contadores reproducibles en servidor.
- Pausas, reanudaciones y calendarios trazables.
- Horario contractual separado de disponibilidad y soporte.
- Cambios de hora correctos.

## 176. Experiencia móvil

Cada flujo principal debe poder completarse en móvil sin depender del escritorio:

- solicitar;
- aceptar;
- asignar;
- comenzar;
- bloquear;
- publicar;
- corregir;
- pagar o confirmar;
- preparar menú;
- consultar informe;
- gestionar equipo y ajustes permitidos.

## 177. Trazabilidad

Para cada solicitud, trabajo, menú, pago, informe y oportunidad debe poder reconstruirse:

- quién;
- qué;
- cuándo;
- desde qué contexto;
- valor anterior;
- valor nuevo;
- motivo cuando corresponda.

## 178. Ausencia de datos

Ningún panel muestra números ficticios en producción. Debe indicar:

- integración no conectada;
- todavía no hay datos;
- última sincronización;
- error;
- periodo insuficiente.

## 179. Coherencia de lenguaje

Las mismas entidades y estados deben conservar el mismo nombre en escritorio, móvil, correos, push, PDF e historial.

---

# 180. Definición final del producto

> **Cuotly es una plataforma SaaS multiempresa, creada por Restavor, que centraliza la relación operativa entre proveedores de mantenimiento digital y restaurantes: espacios, establecimientos, planes, solicitudes, trabajos, tareas, equipo, plazos, consumos, comunicación, archivos, pagos, informes, analítica, oportunidades y Menú Diario; ofreciendo a cada usuario una visión adaptada a sus permisos y conservando seguridad, trazabilidad y control humano sobre las decisiones importantes.**
