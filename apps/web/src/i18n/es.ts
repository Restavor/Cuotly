/**
 * Único diccionario de textos visibles al usuario. Ningún componente debe
 * tener un literal de interfaz escrito directamente — siempre se importa de
 * aquí (CLAUDE.md, regla MUST de estilo de código).
 *
 * La arquitectura está preparada para un idioma futuro (PRD §21.5): cuando
 * haga falta, `en.ts` exportará un objeto con la misma forma que `Dictionary`
 * y un selector de idioma decidirá cuál usar. Hasta entonces, español es el
 * único idioma y se importa directamente.
 */
export const es = {
  common: {
    appName: "Cuotly",
    // §20.6: "la identidad `Cuotly · by Restavor` se conserva siempre",
    // incluso cuando el espacio tiene su propio nombre y logotipo. En el
    // menú lateral se pinta en dos líneas, así que la firma va suelta.
    appOwner: "by Restavor",
    tagline: "Cuotly · by Restavor",
    save: "Guardar",
    cancel: "Cancelar",
    close: "Cerrar",
    retry: "Reintentar",
  },

  states: {
    loading: "Cargando…",
    emptyTitle: "Todavía no hay datos",
    emptyDescription: "Cuando haya algo que mostrar, aparecerá aquí.",
    errorTitle: "Ha ocurrido un error",
    errorDescription: "Inténtalo de nuevo. Si sigue fallando, contacta con soporte.",
    noPermissionTitle: "Sin acceso",
    noPermissionDescription: "No tienes permiso para ver este contenido.",
  },

  auth: {
    login: {
      title: "Bienvenido de nuevo",
      subtitle: "Entra para consultar y actualizar los mantenimientos.",
      emailLabel: "Correo electrónico",
      passwordLabel: "Contraseña",
      submit: "Entrar en Cuotly",
      submitPending: "Entrando…",
      googleSubmit: "Continuar con Google",
      divider: "o",
      noAccount: "¿No tienes cuenta?",
      signupLink: "Regístrate",
      validationRequired: "Rellena correo y contraseña.",
      invalidCredentials: "Correo o contraseña incorrectos.",

      // CA-20 aplicado al login: cuando NO se sabe que la contraseña esté
      // mal, no se dice que lo esté. Un fallo de red contestado como
      // "credenciales incorrectas" manda a cambiar una contraseña que
      // estaba bien.
      unreachable:
        "No hemos podido conectar para comprobar tus datos. Es un problema nuestro o de tu conexión, no de tu contraseña. Vuelve a intentarlo en un momento.",
      rateLimited:
        "Demasiados intentos seguidos. Espera un minuto y vuelve a probar: no hace falta que cambies la contraseña.",
      emailNotConfirmed:
        "Tu correo todavía no está confirmado. Busca el mensaje de confirmación que te enviamos al registrarte.",
      unknownError:
        "No hemos podido entrar y no sabemos por qué. Vuelve a intentarlo; si sigue pasando, escríbenos.",
    },
    signup: {
      title: "Crea tu cuenta",
      subtitle: "Regístrate para empezar a gestionar tu mantenimiento en Cuotly.",
      emailLabel: "Correo electrónico",
      passwordLabel: "Contraseña",
      submit: "Crear cuenta",
      submitPending: "Creando cuenta…",
      googleSubmit: "Continuar con Google",
      divider: "o",
      hasAccount: "¿Ya tienes cuenta?",
      loginLink: "Entra",
      validationRequired: "Rellena correo y contraseña.",
    },
  },

  home: {
    signedInAs: "Has entrado como",
    signOut: "Cerrar sesión",
  },

  platform: {
    createRestavor: {
      title: "Todavía no existe ningún espacio",
      description:
        "Como propietario de Cuotly, puedes crear el espacio de Restavor. Solo hace falta hacerlo una vez.",
      button: "Crear Restavor",
      confirmTitle: "Crear el espacio de Restavor",
      confirmBody:
        "Esto crea el espacio de mantenimiento de Restavor con sus tres planes y el servicio Menú Diario ya configurados. Se audita quién lo creó y cuándo. Solo puede hacerse una vez.",
      confirmAction: "Crear espacio",
      confirmCancel: "Cancelar",
      pending: "Creando…",
      error: "No se ha podido crear el espacio.",
    },
    noSpaceYet: {
      title: "Todavía no perteneces a ningún espacio",
      description: "Cuando alguien te invite a un espacio de mantenimiento, aparecerá aquí.",
    },
  },

  invitations: {
    invalid: "Esta invitación no es válida, ya se usó, o ha caducado.",
  },

  actions: {
    establishmentValidation: "Rellena el grupo y el nombre del establecimiento.",
    inviteValidation: "Indica un correo y un rol válidos.",
    notAuthenticated: "Tu sesión ha caducado. Vuelve a entrar.",
  },

  /**
   * PRD §19 (RN-ARC) · subir y descargar archivos. Cada rechazo dice cuál
   * es el motivo concreto: "no se ha podido subir" no sirve para que
   * alguien sepa si tiene que cambiar el archivo o pedir permiso (P6).
   */
  // ---- Estados del restaurante (maqueta 20, PRD §15.1) -------------
  //
  // Lo que dice cada uno sale de las reglas escritas —RN-EST-08, 09 y 10,
  // RN-FIN-10/12— y de la guarda del servidor, no del dibujo: lo que la
  // pantalla promete y lo que el servidor permite tienen que ser lo mismo.
  establishmentStatus: {
    legendTitle: "Estados del restaurante",
    legendHint:
      "Estos estados indican la disponibilidad de los servicios y funcionalidades de este restaurante.",
    currentMark: "· ahora mismo",
    serviceStoppedMark: "Servicio detenido",
    reasonLabel: "Motivo:",
    serviceStoppedHint:
      "Con el servicio detenido no se crean ni se mueven trabajos, no se publica y los contadores no corren (RN-FIN-12): el plazo no avanza en contra de nadie.",
    notices: {
      configuring: {
        title: "En configuración",
        meaning:
          "El restaurante se está dando de alta. Se puede consultar y completar su ficha; todavía no es el curso normal.",
      },
      active: {
        title: "Activo",
        meaning: "Todos los servicios disponibles.",
      },
      paused: {
        title: "Pausado",
        meaning:
          "Consulta disponible. No se pueden crear solicitudes ni menús, y los trabajos y publicaciones están detenidos (RN-EST-08).",
      },
      ending: {
        title: "En proceso de baja",
        meaning:
          "Se ha comunicado la baja y el servicio sigue activo hasta el final del periodo pagado o de la permanencia vigente (RN-EST-09).",
      },
      read_only: {
        title: "Solo lectura",
        meaning:
          "Se puede consultar todo, pero no crear ni cambiar nada. Son las 24 horas previas a la suspensión (RN-EST-10).",
      },
      suspended: {
        title: "Suspendido",
        meaning:
          "Acceso bloqueado para crear o cambiar. Los datos siguen estando: no se eliminan (RN-EST-10).",
      },
      archived: {
        title: "Archivado",
        meaning:
          "El restaurante ya no está en la lista activa y no admite solicitudes ni trabajos nuevos. Sus datos se conservan.",
      },
      unknown: {
        title: "Estado desconocido",
        meaning:
          "Este restaurante tiene un estado que esta pantalla no sabe explicar. Se trata como detenido hasta saber qué es.",
      },
    },
  },

  // ---- Notas internas del restaurante (RN-EST-13, maqueta 18) ------
  notes: {
    title: "Notas internas",
    // RN-MSG-04 llama fallo grave a mezclar lo interno con lo que ve el
    // cliente, y este panel vive al lado de una conversación que el
    // restaurante sí lee. La insignia es para quien escribe.
    teamOnly: "Solo equipo",
    emptyTitle: "Sin notas todavía",
    emptyReason:
      "Aquí se apunta lo que el equipo necesita recordar de este restaurante. El cliente no ve ninguna nota, nunca.",
    unknownAuthor: "Alguien del equipo",
    restrictedBadge: "Solo propietario y administradores",
    newLabel: "Escribe una nota interna",
    newPlaceholder: "Lo que el equipo debería recordar de este restaurante…",
    newSubmit: "Guardar la nota",
    newPending: "Guardando…",
    restrictLabel:
      "Reservarla al propietario y a los administradores (los trabajadores no la verán).",
    archiveSubmit: "Archivar",
    archivePending: "Archivando…",
  },

  files: {
    label: "Adjuntar un archivo",
    // El límite NO se escribe aquí: sale de `MAX_FILE_SIZE_BYTES`
    // (`src/core/files.ts`), que es lo que de verdad rechaza la subida. Un
    // "25 MB" escrito a mano se queda mintiendo el día que RN-ARC-06
    // cambie, y encima en el sitio donde alguien decide qué archivo elegir.
    hint: (mb: string) => `Imágenes, PDF, Word, Excel o texto. Hasta ${mb} MB.`,
    choose: "Elegir archivo",
    uploading: "Subiendo…",
    uploaded: "Archivo subido.",
    remove: "Quitar",
    attachmentsTitle: "Archivos adjuntos",
    download: "Descargar",
    /*
      El tipo de archivo, dicho corto, para la fila de un adjunto. Las
      claves son los `mime_type` que admite RN-ARC-06 —la misma lista del
      CHECK de `file_versions`— y no una extensión adivinada del nombre:
      un archivo llamado "carta.pdf" que en realidad es un JPEG diría PDF.
    */
    types: {
      "image/jpeg": "JPG",
      "image/png": "PNG",
      "image/webp": "WEBP",
      "image/gif": "GIF",
      "application/pdf": "PDF",
      "application/msword": "Word",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
      "application/vnd.ms-excel": "Excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
      "text/plain": "Texto",
      "text/csv": "CSV",
    },
    rejectedType: "Ese tipo de archivo no se admite. Se aceptan imágenes, PDF, Word, Excel y texto.",
    rejectedSize: (mb: string) => `El archivo pasa de ${mb} MB, que es el máximo por archivo.`,
    rejectedEmpty: "El archivo está vacío.",
    rejectedCategory: "Esa categoría de archivo no existe.",
    rejectedVisibility: "Esa marca de visibilidad no existe.",
    noEstablishment: "Ese restaurante no existe o no tienes acceso a él.",
    noWritePermission: "No tienes permiso para subir archivos de esa categoría a este restaurante.",
    uploadUnavailable: "No se ha podido preparar la subida. Vuelve a intentarlo.",
    pathMismatch: "La subida no corresponde a este restaurante.",
    objectMissing: "La subida no ha llegado a completarse. Vuelve a elegir el archivo.",
    registerFailed: "El archivo se subió pero no se pudo registrar.",
    transferFailed: "La subida se ha cortado. Vuelve a intentarlo.",
  },

  contextSelector: {
    loadErrorTitle: "No se han podido cargar tus contextos",
    loadErrorReason:
      "La consulta al servidor falló. Vuelve a cargar la página; si sigue igual, es un problema de conexión con la base de datos, no de tu cuenta.",
    title: "Elige un espacio",
    subtitle: "Perteneces a más de un espacio de mantenimiento.",
    // HU-02 desde el otro lado: un cliente no pertenece a ningún espacio
    // de mantenimiento, sus contextos son sus restaurantes.
    clientTitle: "Elige un restaurante",
    clientSubtitle: "Tienes acceso a más de un restaurante.",
    sessionsLink: "Mis sesiones",
  },

  space: {
    establishments: {
      title: "Restaurantes",
      empty: "Todavía no hay ningún establecimiento en este espacio.",
      newButton: "+ Nuevo establecimiento",
      formTitle: "Nuevo establecimiento",
      groupLabel: "Grupo o empresa cliente",
      nameLabel: "Nombre del establecimiento",
      submit: "Crear establecimiento",
      submitPending: "Creando…",
      codeColumn: "Código",
      nameColumn: "Nombre",
      statusColumn: "Estado",
    },
    team: {
      title: "Equipo",
      empty: "Todavía no hay nadie más en el equipo.",
      inviteButton: "Invitar",
      inviteFormTitle: "Invitar a alguien al equipo",
      emailLabel: "Correo electrónico",
      roleLabel: "Rol",
      roleAdmin: "Administrador",
      roleWorker: "Trabajador",
      submit: "Enviar invitación",
      submitPending: "Enviando…",
      alreadyRegistered: "Este usuario ya está registrado en Cuotly. Se ha añadido directamente al espacio.",
      invitationCreated:
        "Invitación creada. Como todavía no hay envío automático de correo, comparte este enlace tú mismo:",
      emailColumn: "Correo",
      roleColumn: "Rol",
      statusColumn: "Estado",
      pendingInvitations: "Invitaciones pendientes",
    },
    // Los nombres de los estados NO están aquí: están una sola vez en
    // `naming.states`, que es lo que CA-21 pide de verdad. Hasta el
    // 03/09/2026 este bloque tenía su propia copia de los once estados de
    // trabajo y los cinco de tarea —con "Pendiente de asignación" frente a
    // "Pendiente de asignar" y "Completada" frente a "Hecha"—, o sea dos
    // nombres visibles para el mismo estado, que es exactamente lo que el
    // comentario de encima decía impedir. No la usaba ninguna pantalla, y
    // `naming.test.ts` no la veía porque solo vigila `naming.states`.
    jobs: {
      // RN-SLA-17: es una condición calculada que convive con el estado,
      // nunca lo sustituye.
      outOfDeadline: "Fuera de plazo",
      // RN-JOB-13: 30 días naturales en la columna, después al historial.
      finishedColumn: "Finalizados",
      loadLevels: {
        low: "Carga baja",
        normal: "Carga normal",
        high: "Carga alta",
        very_high: "Carga muy alta",
      },
    },

    messages: {
      // RN-MSG-02 / HU-35 y CLAUDE.md MUST NOT: el cliente nunca ve quién
      // del equipo escribió. `list_conversation_messages()` devuelve
      // sender_display='maintenance_team' y la pantalla lo resuelve aquí.
      maintenanceTeam: "Equipo de mantenimiento",
      // Quien escribe del lado del restaurante, cuando la pantalla no
      // tiene su nombre: al propio restaurante no se le dan identidades
      // individuales de nadie, ni del equipo ni de sus compañeros.
      establishmentSide: "El restaurante",
      edited: "Editado",
      readOnly: "Esta conversación es de solo lectura",
      internalNote: "Nota interna",
      unread: "Sin leer",
      // RN-MSG-06 · la separación que marca dónde se dejó de leer. Se
      // dice con palabras y no solo con un color: un cambio de tono no lo
      // percibe todo el mundo.
      unreadSeparator: "Mensajes nuevos",
      // RN-MSG-07 · los 10 minutos. Quién puede editar lo decide el
      // servidor (`edit_message()`); esta pantalla solo se adelanta al
      // mismo cálculo, con `canEditMessage()` de src/core/messages.ts.
      editAction: "Editar",
      editLabel: "Corrige tu mensaje",
      editSubmit: "Guardar el cambio",
      editPending: "Guardando…",
      editCancel: "Dejarlo como estaba",
      editWindowHint:
        "Puedes corregirlo durante 10 minutos desde que lo enviaste. Después queda la marca «Editado» y se conserva lo que decía antes.",
    },
    files: {
      internal: "Interno",
      sharedWithClient: "Compartido con el restaurante",
      archived: "Archivado",
      version: "Versión",
      // RN-ARC-01 · las ocho categorías, nombradas UNA vez. Viven aquí y
      // no en la ficha del equipo porque las leen los dos lados: la ficha
      // de §15.2 y el catálogo del restaurante. Un segundo diccionario de
      // lo mismo es cómo aparecieron "Completada" y "Hecha" para el mismo
      // estado (salvedad 18 del ROADMAP).
      categories: {
        logos: "Logos",
        photos: "Fotografías",
        menus: "Menús",
        documents: "Documentos",
        reports: "Informes",
        billing: "Facturación",
        requests_and_jobs: "Solicitudes y trabajos",
        other: "Otros",
      },
    },
    finance: {
      statusPending: "Pendiente",
      statusPartiallyPaid: "Pago parcial",
      statusPaid: "Pagado",
      statusOverdue: "Vencido",
      statusRefunded: "Reembolsado",
      statusWaived: "Perdonado",
      outstanding: "Pendiente de cobro",
      collected: "Cobrado",
    },
    statuses: {
      active: "Activo",
      configuring: "Configurando",
      paused: "Pausado",
      ending: "Finalizando",
      read_only: "Solo lectura",
      suspended: "Suspendido",
      archived: "Archivado",
      invited: "Invitado",
      temporarily_absent: "Ausente",
      inactive: "Inactivo",
      access_revoked: "Acceso revocado",
    },
  },

  /**
   * CA-21 · el ÚNICO sitio donde una entidad o un estado tiene nombre.
   *
   * Escritorio, navegación móvil, cuerpo del correo, historial y búsqueda
   * importan de aquí. Si un estado necesitara llamarse distinto en algún
   * sitio, dejaría de cumplirse el criterio — así que no hay variantes
   * "cortas" ni "para móvil": el nombre es el nombre.
   *
   * `naming.test.ts` comprueba que cubre exactamente los valores de
   * `src/core/naming.ts`, ni uno menos ni uno más.
   */
  naming: {
    entities: {
      establishment: "Restaurante",
      group: "Grupo",
      request: "Solicitud",
      job: "Trabajo",
      task: "Tarea",
      person: "Persona",
      plan: "Plan",
      charge: "Cobro",
      file: "Archivo",
      absence: "Ausencia",
      conversation: "Conversación",
    },
    // CA-21: las cuatro categorías de cambio (RN-CLS), con un solo nombre
    // visible cada una.
    categories: {
      small: "Cambio pequeño",
      photo: "Fotografía",
      medium: "Cambio mediano",
      large: "Cambio grande",
    },
    /**
     * RN-ASG-01 · las siete especialidades de `SPECIALTIES`
     * (src/core/assignment.ts), que es de donde salen los valores.
     *
     * Se llaman igual aquí que en el desplegable de asignación y que en el
     * historial: es el mismo criterio CA-21 que las categorías de arriba, y
     * `naming.test.ts` falla si aparece una especialidad sin nombre o un
     * nombre huérfano.
     */
    specialties: {
      web: "Web",
      design: "Diseño",
      copy: "Textos",
      seo: "SEO",
      daily_menu: "Menú Diario",
      analytics: "Analítica",
      general: "General",
    },
    states: {
      request: {
        draft: "Borrador",
        received: "Recibida",
        analyzing: "En análisis",
        pending_internal_validation: "Pendiente de validar",
        needs_information: "Falta información",
        pending_client_acceptance: "Pendiente de aceptación",
        accepted: "Aceptada",
        in_progress: "En curso",
        published: "Publicada",
        // RN-COR: el restaurante ha pedido la corrección y todavía nadie
        // la ha empezado. Faltaba, y es un estado por el que pasa toda
        // corrección antes de `in_correction`.
        correction_requested: "Corrección pedida",
        in_correction: "En corrección",
        closed: "Cerrada",
        rejected: "Rechazada",
        cancelled_before_start: "Cancelada antes de empezar",
        cancelled_after_start: "Cancelada después de empezar",
      },
      // PRD §11.1, los once estados de trabajo. `reassignment_requested`
      // y los dos cancelados faltaban: un trabajo en cualquiera de los
      // tres enseñaba el valor crudo en inglés, y el `cancelled` que
      // había aquí la base no lo admite (RN-ASG-09, RN-JOB-04).
      job: {
        pending_assignment: "Pendiente de asignar",
        assigned: "Asignado",
        reassignment_requested: "Reasignación pedida",
        in_progress: "En curso",
        blocked_by_client: "Bloqueado · Esperando al restaurante",
        authorized_pause: "En pausa autorizada",
        published: "Publicado",
        in_correction: "En corrección",
        completed: "Finalizado",
        cancelled_before_start: "Cancelado antes de empezar",
        cancelled_after_start: "Cancelado después de empezar",
      },
      // PRD §11.2, los cinco estados de tarea. `blocked` faltaba y
      // `completed` se llamaba aquí `done`, que no existe en la base.
      task: {
        pending: "Pendiente",
        in_progress: "En curso",
        blocked: "Bloqueada",
        completed: "Hecha",
        cancelled: "Cancelada",
      },
      charge: {
        pending: "Pendiente",
        paid: "Pagado",
        partially_paid: "Pagado en parte",
        overdue: "Vencido",
        waived: "Perdonado",
        refunded: "Reembolsado",
      },
      establishment: {
        configuring: "Configurando",
        active: "Activo",
        paused: "Pausado por impago",
        ending: "Finalizando",
        read_only: "Solo lectura",
        suspended: "Suspendido por impago",
        archived: "Archivado",
      },
      absence: {
        requested: "Pedida",
        approved: "Aprobada",
        rejected: "Rechazada",
        cancelled: "Cancelada",
      },
    },
  },

  /**
   * §20.4 · el Inicio del espacio. "Resumen general, restaurantes y
   * estados, solicitudes y trabajos críticos, carga del equipo, ingresos y
   * pendientes, incidencias, actividad reciente."
   *
   * Los nombres de estado NO se repiten aquí: la insignia de cada fila de
   * "Necesita atención" sale de `naming.states`, que es el único sitio
   * donde un estado tiene nombre (CA-21). Lo que sí vive aquí son los
   * títulos, los motivos de los vacíos y las frases de la actividad, que
   * no son estados sino lo que ha pasado.
   */
  spaceHome: {
    title: "Inicio",
    // El subtítulo dice la verdad de la pantalla, no una consigna fija:
    // con la lista vacía, "Esto necesita tu atención" sería mentira.
    subtitleAttention: "Esto necesita tu atención",
    subtitleClear: "Nada reclama tu atención ahora mismo",

    kpi: {
      establishments: "Restaurantes activos",
      requests: "Solicitudes pendientes",
      jobs: "Trabajos próximos a vencer",
      // Qué cuenta exactamente el tercer número. RN-SLA-10, RN-SLA-15 y
      // RN-SLA-17: no es una estimación, son los plazos del PRD.
      jobsHint: "Con el plazo de inicio o de entrega a punto de agotarse, o ya agotado.",
      // CA-20 · cuando la consulta falla, lo que va en el sitio del número
      // es el motivo. Un cero sería indistinguible de "no hay ninguno".
      unavailable: "No se ha podido calcular",
    },

    attention: {
      title: "Necesita atención",
      seeAll: "Ver todas",
      emptyTitle: "No hay nada pendiente",
      emptyReason:
        "Cuando una solicitud espere validación, un trabajo se quede sin asignar o un plazo se acerque, aparecerá aquí.",
      reviewRequest: "Revisar solicitud",
      openJob: "Abrir trabajo",
      // RN-SLA-10 y RN-SLA-15 · el tiempo que queda, en horas laborables:
      // el reloj contractual no cuenta noches ni fines de semana, así que
      // "2 h" aquí no son dos horas de reloj de pared.
      remainingToStart: (tiempo: string) => `Quedan ${tiempo} para comenzar`,
      remainingToDeliver: (tiempo: string) => `Quedan ${tiempo} para entregar`,
      hours: (horas: number) => `${horas} h`,
      minutes: (minutos: number) => `${minutos} min`,
      hoursAndMinutes: (horas: number, minutos: number) => `${horas} h ${minutos} min`,
    },

    teamLoad: {
      title: "Carga del equipo",
      seeAll: "Ver equipo",
      points: (puntos: number) => (puntos === 1 ? "1 punto" : `${puntos} puntos`),
      emptyTitle: "Todavía no hay nadie en el equipo",
      noPermissionTitle: "No puedes ver la carga del equipo",
      noPermissionReason:
        "Hace falta poder asignar trabajos para ver la carga de otras personas.",
    },

    dailyMenu: {
      title: "Menú Diario",
      // CLAUDE.md MUST NOT: un contador a cero aquí parecería un dato real.
      // Menú Diario es la Fase 2 entera y todavía no publica nada.
      notBuiltTitle: "Todavía no está construido",
      notBuiltReason:
        "Menú Diario llega en la Fase 2. Cuando exista, sus publicaciones pendientes se contarán aquí.",
      openLink: "Ver Menú Diario",
    },

    activity: {
      title: "Actividad reciente",
      seeAll: "Ver toda la actividad",
      emptyTitle: "Todavía no ha pasado nada",
      today: "Hoy",
      yesterday: "Ayer",
      // "Hoy, 10:24" — la fecha se compone con la hora del espacio.
      at: (dia: string, hora: string) => `${dia}, ${hora}`,
      /**
       * Qué ha pasado, dicho como frase. No sustituye al nombre del
       * estado —ese sigue saliendo de `naming.states` y va en la insignia
       * de al lado—: describe la transición, que es lo que se lee en una
       * lista de actividad.
       *
       * Sin identidad de nadie, a propósito (CLAUDE.md MUST NOT): dice qué
       * ha pasado y dónde, nunca quién lo hizo. Para eso está la auditoría,
       * con su permiso.
       */
      job: {
        pending_assignment: "Se ha creado un trabajo",
        assigned: "Se ha asignado un trabajo",
        reassignment_requested: "Se ha pedido reasignar un trabajo",
        in_progress: "Ha comenzado un trabajo",
        blocked_by_client: "Un trabajo se ha bloqueado esperando al restaurante",
        authorized_pause: "Un trabajo se ha pausado",
        published: "Se ha publicado un trabajo",
        in_correction: "Ha empezado una corrección",
        completed: "Se ha cerrado un trabajo",
        cancelled_before_start: "Se ha cancelado un trabajo antes de empezar",
        cancelled_after_start: "Se ha cancelado un trabajo ya empezado",
      },
      task: {
        pending: "Se ha creado una tarea",
        in_progress: "Ha comenzado una tarea",
        blocked: "Una tarea se ha bloqueado",
        completed: "Se ha terminado una tarea",
        cancelled: "Se ha cancelado una tarea",
      },
    },
  },

  nav: {
    home: "Inicio",
    establishments: "Restaurantes",
    requests: "Solicitudes",
    jobs: "Trabajos",
    tasks: "Tareas",
    dailyMenu: "Menú Diario",
    messages: "Mensajes",
    calendar: "Calendario",
    finance: "Finanzas",
    reports: "Informes",
    team: "Equipo",
    plans: "Planes y servicios",
    agent: "Agente Cuotly",
    agentBadge: "Próximamente",
    settings: "Ajustes",
    more: "Más",
    newRequest: "+ Nueva solicitud",
    // §20.1 y HU-05 · dos destinos que no son del espacio sino de la
    // cuenta. Viven en "Más" porque en móvil no hay menú lateral donde
    // ponerlos.
    switchSpace: "Cambiar de espacio",
    sessions: "Mis sesiones",
    skipToContent: "Saltar al contenido",
    mainLabel: "Contenido principal",
    menuLabel: "Menú del espacio",
    breadcrumbLabel: "Dónde estás",
    account: "Mi cuenta",
  },

  /**
   * El rol, con el nombre que ve la persona. §20.1: el selector de
   * contexto enseña "nombre, logotipo, tipo, rol y alertas rápidas", y el
   * menú lateral repite ese mismo par para que quien mira sepa siempre con
   * qué sombrero está entrando.
   *
   * Un cliente no tiene rol en el espacio de mantenimiento —no es miembro—:
   * lo que es, es un restaurante. Por eso los dos roles de cliente se
   * llaman igual que la entidad (CA-21).
   */
  roles: {
    owner: "Propietario del espacio",
    admin: "Administrador",
    worker: "Trabajador",
    client: "Restaurante",
    client_daily_menu: "Restaurante",
  },

  search: {
    open: "Buscar",
    placeholder: "Buscar restaurantes, solicitudes, trabajos…",
    hint: "Ctrl/Cmd + K",
    // El mismo atajo, en la forma corta que cabe en la cabecera.
    shortcut: "⌘K",
    title: "Búsqueda global",
    minLength: "Escribe al menos dos caracteres.",
    noResults: "Sin resultados",
    noResultsReason:
      "No hay nada con ese texto entre lo que tú puedes ver. La búsqueda solo devuelve elementos a los que tienes acceso.",
    resultsLabel: "Resultados de la búsqueda",
  },

  create: {
    label: "Crear",
    ariaLabel: "Crear elemento",
    request: "Nueva solicitud",
    establishment: "Nuevo restaurante",
    invite: "Invitar a alguien al equipo",
    absence: "Pedir una ausencia",
    holiday: "Añadir un festivo",
    empty: "No tienes permiso para crear nada aquí.",
  },

  notifications: {
    title: "Avisos",
    open: "Abrir avisos",
    unreadLabel: "avisos sin leer",
    markRead: "Marcar como leído",
    markAllRead: "Marcar todos como leídos",
    emptyTitle: "No tienes avisos",
    emptyReason: "Cuando pase algo que te afecte, aparecerá aquí.",
    mandatoryHint: "Este aviso no se puede desactivar.",
    preferences: "Preferencias de aviso",
    events: {
      request_submitted: "Solicitud enviada",
      job_unassigned: "Trabajo sin asignar",
      job_assigned: "Trabajo asignado",
      job_started: "Trabajo comenzado",
      job_published: "Trabajo publicado",
      correction_requested: "Corrección pedida",
      job_reassignment_requested: "Reasignación de trabajo pedida",
      task_reassignment_requested: "Reasignación de tarea pedida",
      terms_version_published: "Condiciones nuevas pendientes de aceptar",
      consumption_threshold_80: "Has consumido el 80 % de tu plan",
      consumption_threshold_100: "Has agotado tu plan",
      t2_threshold_50: "Plazo de inicio al 50 %",
      t2_threshold_80: "Plazo de inicio al 80 %",
      t2_threshold_100: "Plazo de inicio agotado",
      t2_critical_alert: "Aviso crítico del plazo de inicio",
      t2_reassignment_suggestion: "Conviene reasignar el trabajo",
      t3_threshold_75: "Plazo de ejecución al 75 %",
      t3_threshold_90: "Plazo de ejecución al 90 %",
      t3_threshold_100: "Plazo de ejecución agotado",
      establishment_paused_nonpayment: "Restaurante pausado por impago",
      establishment_suspended_nonpayment: "Restaurante suspendido por impago",
      establishment_reactivated: "Restaurante reactivado",
      absence_requested: "Ausencia pedida",
      absence_decided: "Ausencia resuelta",
      absence_uncovered_jobs: "Trabajos sin cobertura",
    },
    email: {
      subject: (evento: string, espacio: string) => `${evento} · ${espacio}`,
      body: (evento: string, espacio: string, enlace: string) =>
        [
          `${evento}.`,
          "",
          `Espacio: ${espacio}`,
          `Ábrelo en Cuotly: ${enlace}`,
          "",
          "Puedes cambiar qué avisos recibes por correo desde Preferencias de aviso.",
        ].join("\n"),
    },
  },

  teamArea: {
    /**
     * El filtro por restaurante de los tres listados, al que llevan los
     * enlaces "Ver todas" de la Operación de la ficha (vista 04).
     */
    listFilter: {
      only: (name: string) => `Solo las de ${name}.`,
      unknown: "Ese restaurante no existe o no puedes verlo, así que la lista sale vacía.",
      clear: "Ver todas",
    },

    /**
     * HU-25 · el libro de consumos de un establecimiento visto por el
     * equipo, que a diferencia del del cliente (`clientArea.ledger*`)
     * lleva **autor**: es lo que pide la historia.
     */
    establishments: {
      title: "Restaurantes",
      subtitle: "Los restaurantes de este espacio.",
      // §20.2 · el subtítulo del listado cuenta lo que hay, y cuenta
      // ACTIVOS: un restaurante archivado sigue en la lista pero no es un
      // establecimiento en servicio.
      activeCount: (n: number) =>
        n === 1 ? "1 establecimiento activo" : `${n} establecimientos activos`,
      createButton: "Crear establecimiento",
      emptyTitle: "No hay ningún restaurante",
      emptyReason: "Cuando se dé de alta un restaurante, aparecerá aquí.",
      filteredEmptyTitle: "Ningún restaurante coincide",
      filteredEmptyReason:
        "Hay restaurantes en el espacio, pero ninguno cumple los filtros de arriba. Quítalos para verlos todos.",
      nameColumn: "Establecimiento",
      codeColumn: "Código",
      groupColumn: "Grupo",
      planColumn: "Plan",
      statusColumn: "Estado",
      attentionColumn: "Necesita atención",
      ledgerLink: "Consumos",
      openSheet: "Abrir la ficha",
      noPlan: "Sin plan",
      noAttention: "Sin pendientes",
      // El resumen de la columna: el motivo más urgente y cuántos hay de
      // él. Los nombres de estado NO se repiten aquí — son frases sobre lo
      // que hay que hacer, no etiquetas de estado (CA-21).
      attentionHeadline: {
        job_out_of_deadline: (n: number) =>
          n === 1 ? "1 trabajo fuera de plazo" : `${n} trabajos fuera de plazo`,
        job_about_to_expire: (n: number) =>
          n === 1 ? "1 trabajo a punto de vencer" : `${n} trabajos a punto de vencer`,
        job_pending_assignment: (n: number) =>
          n === 1 ? "1 trabajo por asignar" : `${n} trabajos por asignar`,
        request_pending_validation: (n: number) =>
          n === 1 ? "1 solicitud por validar" : `${n} solicitudes por validar`,
        request_correction_requested: (n: number) =>
          n === 1 ? "1 corrección pedida" : `${n} correcciones pedidas`,
        job_blocked_by_client: (n: number) =>
          n === 1 ? "1 trabajo esperando al restaurante" : `${n} trabajos esperando al restaurante`,
      },
      attentionOthers: (n: number) => `y ${n} más`,
      filters: {
        legend: "Filtrar los restaurantes",
        searchLabel: "Buscar restaurante",
        searchPlaceholder: "Nombre o código",
        groupLabel: "Grupo",
        planLabel: "Plan",
        statusLabel: "Estado",
        all: "Todos",
        withoutPlan: "Sin plan",
        submit: "Filtrar",
        clear: "Quitar filtros",
      },
    },
    ledger: {
      title: "Libro de consumos",
      subtitle: "Cada apunte del ciclo, con su motivo y quién lo hizo.",
      emptyTitle: "Este restaurante no ha consumido nada",
      emptyReason: "Aquí aparece cada cambio que descuenta del plan, en cuanto haya uno.",
      dateColumn: "Fecha",
      categoryColumn: "Categoría",
      amountColumn: "Movimiento",
      requestColumn: "Solicitud",
      typeColumn: "Tipo de apunte",
      reasonColumn: "Motivo",
      authorColumn: "Autor",
      // RN-CON: los tres tipos de apunte del libro, con un solo nombre
      // visible cada uno (CA-21).
      types: {
        debit: "Consumo",
        return: "Devolución",
        compensatory_credit: "Crédito compensatorio",
      },
      // P6: un apunte sin explicación se dice que no la tiene; no se
      // rellena con una frase inventada.
      noReason: "Sin motivo anotado",
      authorSystem: "Sistema",
      authorSelf: "Tú",
      authorClient: "El restaurante",
      authorTeam: "Equipo de mantenimiento",
      noAccessTitle: "Sin acceso a este restaurante",
      noAccessReason: "El libro de consumos lo ve el equipo del espacio.",
    },
    requests: {
      title: "Solicitudes",
      subtitle: "Lo que han pedido los restaurantes, por orden de llegada.",
      emptyTitle: "No hay solicitudes",
      emptyReason: "Cuando un restaurante pida un cambio, aparecerá aquí.",
      codeColumn: "Código",
      establishmentColumn: "Restaurante",
      descriptionColumn: "Qué piden",
      stateColumn: "Estado",
      categoryColumn: "Categoría",
      dateColumn: "Recibida",
      openLink: "Abrir",
      filterAll: "Todas",
      filterOpen: "Sin resolver",
      filterMine: "Pendientes de mí",
      detailTitle: "Solicitud",
      contextLabel: "Dónde",
      // El análisis se intenta solo al enviarse la solicitud (RN-CLS-01).
      // Esto es la red de seguridad para cuando aquel intento falló, y por
      // eso el texto no dice "empezar": dice lo que pasó y lo que se puede
      // hacer.
      retryTitle: "El análisis automático no salió",
      retrySubmit: "Reintentar análisis",
      retryPending: "Analizando…",
      retryHint:
        "Esta solicitud tenía que haberse clasificado sola al enviarse y no fue posible. Reintentarlo vuelve a pedir la propuesta de categoría y resumen; el restaurante no ve nada hasta que la valides.",
      validateTitle: "Validar la clasificación",
      validateHint:
        "El restaurante no ve nada de esto hasta que lo validas. Elige la categoría real y escribe el resumen que él leerá.",
      validateCategoryLabel: "Categoría",
      validateSummaryLabel: "Resumen para el restaurante",
      validateSubmit: "Validar y enviar al restaurante",
      validatePending: "Validando…",
      infoTitle: "Pedir información",
      infoHint: "El contador de primera atención se detiene mientras esperas su respuesta.",
      infoLabel: "Qué necesitas saber",
      infoSubmit: "Pedir información",
      infoPending: "Pidiendo…",
      rejectTitle: "Rechazar",
      rejectHint: "Hay que explicar por qué. El restaurante lee este motivo.",
      rejectLabel: "Motivo",
      rejectSubmit: "Rechazar la solicitud",
      rejectPending: "Rechazando…",
      waitingClient: "Esperando al restaurante",
      waitingClientReason:
        "Ya está validada y enviada. El siguiente paso es suyo: aceptar o rechazar el alcance.",
      jobLink: "Ver el trabajo",

      // ---------------------------------------------------------------
      // El detalle de una solicitud (§20.4, HU-11): lo que pidió el
      // restaurante a la izquierda, la propuesta y su validación a la
      // derecha, y debajo el historial.
      // ---------------------------------------------------------------
      back: "Volver a solicitudes",

      // Maqueta 05 · el paginador. Solo aparece viniendo de una lista.
      pagerLabel: "Moverse por la lista",
      pagerPosition: (index: number, total: number) => `${index} de ${total}`,
      pagerPrevious: "Solicitud anterior de la lista",
      pagerNext: "Solicitud siguiente de la lista",
      clientCardTitle: "Solicitud del restaurante",
      establishmentLabel: "Restaurante",
      receivedAtLabel: "Fecha de recepción",
      messageLabel: "Mensaje del restaurante",
      attachments: (cuantos: number) => `Adjuntos (${cuantos})`,
      attachmentsNone: "Sin adjuntos",
      attachmentsNoneReason: "Esta solicitud no lleva ningún archivo.",
      attachmentsFailedTitle: "No se han podido leer los adjuntos",
      attachmentDownload: "Descargar",
      attachmentUnknownType: "Archivo",
      attachmentNoVersion: "Sin versión registrada",
      // RN-ARC-06 · el tamaño se guarda en bytes; el que se lee es en MB
      // o KB, con la coma decimal del español.
      attachmentMegabytes: (mb: string) => `${mb} MB`,
      attachmentKilobytes: (kb: string) => `${kb} KB`,

      proposalTitle: "Propuesta de clasificación",
      validatedTitle: "Clasificación validada",

      // Maqueta 05 · los tres pasos, derivados del estado (no hay columna
      // de progreso: `validationSteps()` los calcula).
      validationStatusTitle: "Estado de validación",
      validationSteps: {
        analysis: "Análisis completado",
        internal: "Validación interna",
        client: "Aceptación del cliente",
      },
      validationStepStatus: {
        done: "Hecho",
        current: "Pendiente",
        pending: "Todavía no le toca",
        rejected: "Rechazada aquí",
        unknown: "No consta que se llegara a hacer",
      },
      proposalCategoryLabel: "Categoría",
      proposalConsumptionLabel: "Consumo estimado",
      proposalScopeLabel: "Alcance",
      // RN-CLS-08 · lo que costará aceptarla. Se registra en la
      // aceptación del cliente, no ahora, y por eso es "estimado".
      consumptionOne: (categoria: string) => `1 ${categoria.toLocaleLowerCase("es-ES")}`,
      consumptionRemaining: (quedan: number, incluidos: number) =>
        `Le quedan ${quedan} de ${incluidos} en este ciclo`,
      consumptionBudgeted: "A presupuesto",
      consumptionBudgetedReason:
        "Su plan no incluye ningún cambio de esta categoría, así que no toca bolsa: se presupuesta aparte.",
      consumptionExhausted: "Sin crédito en el ciclo",
      consumptionExhaustedReason:
        "Ha gastado los que incluye su plan de esta categoría. Con la bolsa a cero no podrá aceptar la propuesta hasta que renueve el ciclo.",
      consumptionUnknown: "No se ha podido calcular",
      consumptionUnknownReason:
        "No se ha podido leer el ciclo de consumos de este restaurante, así que no se afirma lo que costará.",
      // RN-CLS-02 · si la propuesta salió del motor de reglas y no de la
      // IA, se dice: quien valida tiene que saber qué está leyendo.
      proposalSourceAi: "Propuesta por la IA",
      proposalSourceRules: "Propuesta por reglas",
      proposalFallbackReason: (motivo: string) => `Motivo: ${motivo}`,
      proposalNoneTitle: "Todavía no hay propuesta",
      proposalNoneReason:
        "El análisis automático no ha dejado ninguna clasificación para esta solicitud. Escribe tú la categoría y el resumen que leerá el restaurante.",

      // RN-SLA-01/02/03 · el reloj de primera atención.
      t1Title: "Primera atención",
      t1Remaining: (tiempo: string) => `Quedan ${tiempo} laborables`,
      t1Hint: "Tiempo estimado para validar la propuesta de clasificación.",
      t1Overdue: "Fuera de plazo",
      t1OverdueHint:
        "El plazo de primera atención se ha pasado. Sigue contando: validarla ahora es lo que lo cierra.",
      t1NotStarted: "El contador no ha arrancado",
      t1NotStartedHint: "Arranca cuando el restaurante envía la solicitud.",
      t1StoppedWaitingClient: "Contador parado: espera al restaurante",
      t1StoppedWaitingInformation: "Contador parado: falta información",
      t1StoppedRejected: "Contador parado: solicitud rechazada",
      t1StoppedClosed: "Contador parado: este tramo ya pasó",
      t1Total: (horas: number) => `Plazo de ${horas} h laborables`,

      validateProposalSubmit: "Validar propuesta",
      validateProposalPending: "Validando…",
      correctClassification: "Corregir clasificación",
      correctCancel: "Dejarlo como está",
      afterValidateNote: "Después se solicitará la aceptación del cliente.",
      noManageTitle: "No puedes validar esta solicitud",
      noManageReason:
        "Validar, corregir, pedir información o rechazar es cosa del propietario o de un administrador (RN-CLS-03).",

      historyTitle: "Historial de la solicitud",
      historySystemActor: "Sistema",
      historyEmptyTitle: "Sin movimientos registrados",
    },
    jobs: {
      // Maqueta 06 · volver a la lista y moverse por ella.
      backToList: "Volver a trabajos",

      pagerLabel: "Moverse por la lista",
      pagerPosition: (index: number, total: number) => `${index} de ${total}`,
      pagerPrevious: "Trabajo anterior de la lista",
      pagerNext: "Trabajo siguiente de la lista",
      title: "Trabajos",
      subtitle: "Lo aceptado por los restaurantes, listo para hacerse.",
      emptyTitle: "No hay trabajos",
      emptyReason: "Un trabajo nace cuando un restaurante acepta una solicitud.",
      codeColumn: "Código",
      establishmentColumn: "Restaurante",
      stateColumn: "Estado",
      assigneeColumn: "Responsable",
      categoryColumn: "Categoría",
      // La bandeja va ordenada por esta columna, así que la columna tiene
      // que estar: un orden que el equipo no pueda explicar mirando la
      // tabla parece un fallo de la tabla.
      priorityColumn: "Prioridad",
      priorityShort: (rank: number) => `Nº ${rank}`,
      priorityShortNone: "—",
      orderHint:
        "Primero lo que cada restaurante ha marcado como más importante; después, lo más reciente.",
      unassigned: "Sin asignar",
      openLink: "Abrir",
      detailTitle: "Trabajo",
      assignTitle: "Asignar",
      assignHint:
        "Los candidatos y su orden los calcula el servidor: especialidad, establecimientos autorizados, disponibilidad y carga.",
      assignEmptyTitle: "No hay ningún candidato",
      assignEmptyReason:
        "Nadie del equipo reúne ahora mismo la especialidad, la autorización y la disponibilidad que pide este trabajo.",
      assignSubmit: "Asignar",
      assignPending: "Asignando…",
      loadColumn: "Carga",
      jobsColumn: "Trabajos activos",
      startSubmit: "Comenzar",
      startPending: "Comenzando…",
      blockTitle: "Bloquear",
      blockHint: "Un trabajo bloqueado detiene su contador de ejecución.",
      blockReasonLabel: "Motivo del bloqueo",
      blockNoteLabel: "Detalle",
      blockSubmit: "Bloquear",
      blockPending: "Bloqueando…",
      unblockSubmit: "Desbloquear",
      unblockPending: "Desbloqueando…",
      publishTitle: "Publicar",
      publishHint:
        "Al publicar arranca la ventana de corrección del restaurante. La fecha la calcula el servidor con el reloj laborable.",
      publishSubmit: "Publicar",
      publishPending: "Publicando…",
      // §20.4 · la información operativa de un trabajo. Los dos contadores
      // se recalculan desde sus eventos (CA-10) y "Fuera de plazo" es una
      // condición que convive con el estado, nunca lo sustituye (RN-SLA-17).
      operativeTitle: "Información operativa",
      assigneeLabel: "Responsable",
      assigneeNone: "Sin asignar",
      t2Title: "Inicio operativo",
      t2Hint: "Tiempo estimado para comenzar el trabajo.",
      t2Done: "Completado",
      t2DoneHint: "El trabajo ha comenzado.",
      t2NotStarted: "El contador no ha arrancado",
      t2NotStartedHint: "Arranca cuando el trabajo se asigna a alguien (RN-ASG-05).",
      t3Title: "Ejecución",
      t3Hint: "Tiempo estimado para completar el trabajo.",
      t3NotStarted: "El contador no ha arrancado",
      t3NotStartedHint: "Arranca al pulsar Comenzar.",
      t3Paused: "Contador en pausa",
      t3PausedHint: "Un bloqueo o una pausa autorizada no consumen tiempo (RN-SLA-14).",
      remaining: (tiempo: string) => `Quedan ${tiempo} laborables`,
      outOfDeadline: "Fuera de plazo",
      outOfDeadlineHint:
        "El plazo se ha pasado. Sigue contando: no es un estado, es una condición que convive con el que tenga el trabajo (RN-SLA-17).",
      detailsTitle: "Detalles del trabajo",
      categoryLabel: "Categoría",
      categoryNone: "Sin clasificar",
      consumedLabel: "Cambios consumidos",
      consumedOne: "1 cambio consumido",
      consumedNone: "Ninguno: se presupuesta aparte",
      loadPointsLabel: "Puntos de carga",
      loadPointsValue: (puntos: number) => (puntos === 1 ? "1 punto de carga" : `${puntos} puntos de carga`),
      loadPointsNone: "Sin puntos: el trabajo todavía no tiene categoría",
      noActionTitle: "Nada que hacer aquí ahora",
      noActionReason: "Este trabajo está en un estado que no admite acciones tuyas en este momento.",
      // HU-27 / RN-FIN-05: el trabajador marca pagado un cobro de su
      // restaurante sin pasar por Finanzas. Se habla del restaurante de
      // este trabajo, nunca de los ingresos del espacio.
      chargesTitle: "Cobros de este restaurante",
      chargesHint:
        "Solo los cobros que siguen con deuda viva. Aquí no se cambian precios ni se perdona deuda.",
      chargesEmptyTitle: "No hay ningún cobro pendiente",
      chargesEmptyReason: "Este restaurante no tiene ahora mismo ninguna deuda viva.",
      chargesOutstandingColumn: "Deuda viva",

      // ----------------------------------------------------------------
      // Maqueta 06 · lo que la ficha de ejecución dice de un trabajo.
      // ----------------------------------------------------------------

      // La fecha en que el restaurante aceptó. Sale de `acceptances`, que
      // es el registro de la aceptación (RN-CLS-08), no de una columna del
      // trabajo: el trabajo nace DE ella.
      acceptedOn: (fecha: string) => `Aceptado el ${fecha}`,

      // RN-ASG-01 · qué especialidad pide el trabajo. Se llama
      // "Especialidad" y no "Tipo" a propósito: es el mismo campo que el
      // historial ya nombra "Especialidad requerida", y dos nombres para
      // lo mismo es cómo aparecieron "Completada" y "Hecha" para el mismo
      // estado (salvedad 18 del ROADMAP).
      specialtyLabel: "Especialidad",
      specialtyNone: "Sin especialidad requerida",
      specialtyNoneHint: "Cualquiera del equipo con acceso a este restaurante puede llevarlo.",

      // Maqueta 06 · la prioridad es el PUESTO que le da el restaurante
      // entre sus cambios pendientes, no una etiqueta. La mayoría de los
      // trabajos no la tienen, y eso se dice.
      priorityLabel: "Prioridad del restaurante",
      priorityValue: (rank: number) => `Nº ${rank} de sus cambios pendientes`,
      priorityHint: "Lo ha ordenado así el propio restaurante, incluido en su plan.",
      priorityNone: "Sin ordenar",
      priorityNoneHint:
        "Ordenar los cambios por importancia va incluido en el plan Premium. Este restaurante no lo ha hecho, o su plan no lo incluye.",

      startedAtLabel: "Fecha de inicio",
      startedAtNone: "Todavía no ha comenzado",

      // La fecha de fin, con sus seis casos. Los distingue `jobEnd()` en
      // src/core/job-execution.ts; aquí solo se les pone nombre. Ninguno
      // es un hueco en blanco: CA-20 exige decir el motivo.
      endLabel: "Fecha estimada de fin",
      endPublishedLabel: "Fecha de publicación",
      endPaused: "En pausa: se recalculará al reanudar",
      endPausedHint:
        "Un bloqueo conserva el tiempo restante (RN-SLA-14), así que la fecha se moverá tanto como dure la pausa.",
      endNotStarted: "Sin fecha: el trabajo no ha comenzado",
      endNotStartedHint: "Se podrá estimar al pulsar Comenzar.",
      endCancelled: "Sin fecha: el trabajo se canceló",
      endCancelledHint: "Un trabajo cancelado no tiene fin que estimar.",
      endUnknown: "Sin fecha todavía",
      endUnknownHint: "Sin categoría validada no hay plazo de ejecución que calcular (RN-SLA-12).",
      endEstimatedHint: "Proyección del plazo de ejecución en el reloj laborable del espacio.",

      // §66.2 · los comentarios internos, dentro de la ficha. Es la misma
      // conversación de la bandeja, no una segunda: se pinta aquí porque
      // es donde está quien coordina el trabajo.
      commentsTitle: "Comentarios internos",
      commentsEmptyTitle: "Todavía no hay comentarios",
      commentsEmptyReason: "Nadie del equipo ha escrito aún sobre este trabajo.",
      commentsClosedTitle: "Los comentarios no están abiertos",
      commentsClosedReason:
        "La conversación interna de este trabajo se crea la primera vez que alguien la abre.",
      commentsOpen: "Abrir los comentarios internos",
      commentsOpenPending: "Abriendo…",

      // RN-JOB-10 · lo que se publicó, archivado con el trabajo. Los
      // archivos salen de `file_links` (RN-ARC-02, "elemento
      // relacionado"), no de una columna de `jobs`.
      evidenceTitle: "Evidencia de publicación",
      evidenceHint:
        "Lo que quede aquí queda archivado con el trabajo: es la prueba de qué se publicó y cuándo.",
      evidenceEmptyTitle: "No hay ninguna evidencia",
      evidenceEmptyReason: "Nadie ha adjuntado todavía una captura ni un archivo de lo publicado.",
      evidenceEmptyBeforePublishing:
        "Se adjunta al publicar o después: todavía no hay nada que enseñar.",
      evidenceAddLabel: "Adjuntar una evidencia",
      evidenceAddSubmit: "Adjuntar",
      evidenceAddPending: "Adjuntando…",
      evidenceMissingFile: "Elige un archivo antes de adjuntarlo.",
      evidenceDownload: "Descargar",
    },

    /**
     * HU-21 · desglosar un trabajo en tareas y repartirlas.
     *
     * Los puntos se nombran aquí una sola vez porque salen en dos sitios
     * (el desglose del trabajo y la pantalla de Tareas) y CA-21 exige que
     * se llamen igual en los dos.
     */
    tasks: {
      title: "Tareas",
      subtitle: "Los pasos internos de los trabajos del espacio.",
      emptyTitle: "No hay ninguna tarea",
      emptyReason:
        "Una tarea nace cuando alguien desglosa un trabajo. Los trabajos pequeños no necesitan desglose.",
      titleColumn: "Tarea",
      jobColumn: "Trabajo",
      establishmentColumn: "Restaurante",
      assigneeColumn: "Responsable",
      stateColumn: "Estado",
      weightColumn: "Peso",
      pointsColumn: "Puntos",
      durationColumn: "Duración estimada",
      unassigned: "Sin repartir",
      openJobLink: "Abrir el trabajo",
      filterAll: "Todas",
      filterMine: "Mías",
      filterOpen: "Sin terminar",
      minutesSuffix: "min",
      // §14.4, los cuatro pesos de tarea. RN-ASG-16 deja fuera a
      // propósito cualquier categoría por encima de 4 h.
      weights: {
        light: "Ligera",
        normal: "Normal",
        high: "Alta",
        very_high: "Muy alta",
      },
      // El desglose, dentro del detalle del trabajo.
      breakdownTitle: "Tareas de este trabajo",
      // Maqueta 06 · el mismo título con el recuento. Lo cuenta
      // `taskProgress()`, que no suma las canceladas en ninguno de los dos
      // números.
      breakdownTitleWithCount: (done: number, total: number) => `Tareas (${done}/${total})`,
      // Maqueta 06 · "Tareas (2/4)". Lo cancelado no entra en ninguno de
      // los dos números: lo cuenta `taskProgress()` en
      // src/core/job-execution.ts.
      breakdownProgress: (hechas: number, total: number) => `${hechas}/${total}`,
      breakdownHint:
        "Las tareas son opcionales en un trabajo pequeño y recomendables en uno grande. El peso lo deduce el servidor de la duración que estimes.",
      breakdownEmptyTitle: "Este trabajo no está desglosado",
      breakdownEmptyReason:
        "Todavía no tiene tareas. Mientras no las tenga, los puntos del trabajo son enteros del responsable.",
      addTitle: "Añadir una tarea",
      addTitleLabel: "Qué hay que hacer",
      addDescriptionLabel: "Detalle",
      addMinutesLabel: "Duración estimada en minutos",
      addAssigneeLabel: "Responsable",
      addAssigneeNobody: "Repartir después",
      addSubmit: "Añadir la tarea",
      addPending: "Añadiendo…",
      // RN-ASG-16, dicho antes de que el servidor lo rechace.
      addMinutesHint:
        "Hasta 15 min es Ligera, hasta 45 Normal, hasta 2 h Alta y hasta 4 h Muy alta. Una tarea de más de 4 horas hay que dividirla: no existe una categoría de puntos para ella.",
      assignSubmit: "Repartir",
      assignPending: "Repartiendo…",
      assignEmptyTitle: "No hay a quién repartirle esta tarea",
      assignEmptyReason:
        "Nadie del equipo puede ejecutar trabajos en este restaurante ahora mismo. Repartir una tarea no concede acceso a un restaurante que no se tenga autorizado.",
      startSubmit: "Comenzar",
      startPending: "Comenzando…",
      blockSubmit: "Bloquear",
      blockPending: "Bloqueando…",
      resumeSubmit: "Reanudar",
      resumePending: "Reanudando…",
      completeSubmit: "Marcar hecha",
      completePending: "Guardando…",
      cancelTitle: "Cancelar la tarea",
      cancelReasonLabel: "Motivo",
      cancelSubmit: "Cancelar la tarea",
      cancelPending: "Cancelando…",
      // RN-JOB-01, dicho en la pantalla del trabajador en vez de
      // enseñarle un botón que el servidor le va a negar.
      cancelOnlyStaff:
        "Cancelar una tarea es cosa de un administrador. Si esta ya no hace falta, pídeselo.",
      // RN-ASG-14, el reparto de puntos.
      pointsTitle: "Cómo quedan los puntos",
      pointsBrokenDown:
        "Este trabajo está desglosado, así que sus puntos generales dejan de sumar y cada persona recibe los de sus tareas (RN-ASG-14).",
      pointsWholeJob:
        "Este trabajo no está desglosado, así que sus puntos son enteros del responsable.",
      pointsPersonColumn: "Persona",
      pointsColumnLabel: "Puntos de sus tareas",
      pointsUnassignedWarning:
        "Las tareas sin repartir no suman a nadie todavía. Sus puntos aparecerán cuando tengan responsable.",

      /**
       * Maqueta 07 · "Tareas — asignación y coordinación". La pantalla en
       * la que se reparte y se planifica el desglose de un trabajo, y
       * donde se piden y se resuelven las reasignaciones (RN-ASG-07/08/09).
       */
      coordination: {
        link: "Repartir y coordinar",
        linkHint: "Responsable, fecha prevista y reasignaciones, tarea a tarea.",
        title: "Tareas del trabajo",
        backToJob: "Volver al trabajo",
        subtitle: (code: string, jobTitle: string) => `${jobTitle} · ${code}`,
        dateColumn: "Fecha prevista",
        detailTitle: "Detalle de la tarea",
        detailEmptyTitle: "Ninguna tarea seleccionada",
        detailEmptyReason: "Elige una tarea de la lista para ver su detalle y repartirla.",
        closeDetail: "Cerrar el detalle",
        descriptionTitle: "Descripción",
        // CA-20: si no hay descripción se dice, no se deja el hueco.
        descriptionEmpty: "Esta tarea no lleva descripción.",

        // La fecha prevista. El texto explica qué NO es, porque una fecha
        // en una pantalla de operación se lee como un plazo y ésta no lo
        // es (RN-SLA-17 es una condición de trabajos).
        plannedDateLabel: "Fecha prevista",
        plannedDateHint:
          "Es el día en que el equipo se propone hacerla, no un plazo con el cliente: no cuenta para el plazo de inicio ni para el de ejecución, y pasarse de ella no deja el trabajo fuera de plazo. Déjala vacía y guarda para quitarla.",
        plannedDateEmpty: "Sin fecha prevista",
        plannedDateSubmit: "Guardar la fecha",
        plannedDatePending: "Guardando…",

        // RN-ASG-07/08/09.
        reassignRequest: "Solicitar reasignación",
        reassignReasonLabel: "Motivo de la reasignación",
        reassignReasonPlaceholder: "Describe el motivo de la reasignación…",
        reassignSubmit: "Enviar solicitud",
        reassignPending: "Enviando…",
        reassignPendingTitle: "Reasignación pendiente",
        reassignPendingBy: (quien: string, cuando: string) => `La pidió ${quien} · ${cuando}`,
        // RN-ASG-08, dicho a quien no puede resolverla en vez de
        // enseñarle unos botones que el servidor le va a negar.
        reassignWaitingDecision:
          "Está pendiente de que la resuelva el propietario o un administrador. Mientras tanto la tarea sigue siendo tuya y no cambia de manos.",
        reassignApproveLabel: "Pasársela a",
        reassignApproveSubmit: "Aprobar la reasignación",
        reassignApprovePending: "Aprobando…",
        reassignDecisionReasonLabel: "Motivo de la decisión",
        reassignRejectSubmit: "Rechazar la reasignación",
        reassignRejectPending: "Rechazando…",
        // Por qué no se ofrece repartir mientras hay una solicitud abierta.
        reassignBlocksAssign:
          "Con una reasignación pendiente, la tarea solo cambia de manos aprobándola (RN-ASG-08).",
        reassignHistoryTitle: "Reasignaciones anteriores",
        reassignApprovedBadge: "Aprobada",
        reassignRejectedBadge: "Rechazada",
        reassignHistoryLine: (cuando: string, quien: string) => `${cuando} · la resolvió ${quien}`,

        // Estados vacíos y motivos (CA-20).
        emptyTitle: "Este trabajo no está desglosado",
        emptyReason:
          "No tiene ninguna tarea todavía. Se desglosa desde la ficha del trabajo, y mientras no lo esté, sus puntos son enteros del responsable.",
        readOnlyReason:
          "Sus tareas se conservan como historial de cómo se repartió el trabajo, pero ya no se reparten ni se replanifican.",
        noActions:
          "No puedes repartir ni planificar estas tareas: no eres el responsable del trabajo ni administras el espacio.",
      },
    },
    /**
     * §66 · la bandeja del equipo y las dos conversaciones que hasta ahora
     * no tenían pantalla: la interna de un trabajo (§66.2) y la general de
     * un restaurante (§66.3).
     */
    messages: {
      title: "Mensajes",
      subtitle: "Tus conversaciones del espacio, de la del último mensaje a la más antigua.",
      emptyTitle: "No hay ninguna conversación",
      emptyReason:
        "Aquí aparecen las conversaciones de las solicitudes, las internas de cada trabajo y las generales de cada restaurante, en cuanto exista una.",
      subjectColumn: "Asunto",
      establishmentColumn: "Restaurante",
      lastMessageColumn: "Último mensaje",
      dateColumn: "Fecha",
      unreadColumn: "Sin leer",
      noMessagesYet: "Todavía sin mensajes",
      openLink: "Abrir",
      // El tipo de conversación, dicho como lo entiende quien lo lee.
      typeRequest: "Solicitud",
      typeJobInternal: "Interna del trabajo",
      typeEstablishment: "General del restaurante",
      // §66.2 · el aviso que separa la conversación interna de lo que ve
      // el restaurante. No es decorativo: RN-MSG-04 marca el fallo aquí
      // como grave, y quien escribe tiene que saber en cuál de las dos
      // está.
      internalTitle: "Conversación interna del equipo",
      internalNotice:
        "El restaurante no ve esta conversación. Para hablar con él, usa la de su solicitud o la general de su restaurante.",
      internalOpen: "Abrir la conversación interna del equipo",
      establishmentTitle: "Conversación general del restaurante",
      establishmentNotice:
        "El restaurante lee esta conversación. Para coordinaros entre vosotros, usa la interna de su trabajo.",
      relatedRequest: "Ver la solicitud",
      relatedJob: "Ver el trabajo",
      relatedEstablishment: "Ver el restaurante",
      backToInbox: "Volver a Mensajes",
      notFoundTitle: "Esta conversación no existe o no es tuya",
      notFoundReason:
        "O se ha borrado el elemento del que colgaba, o no tienes acceso a ella. Vuelve a Mensajes para ver las tuyas.",
    },
    finance: {
      title: "Finanzas",
      subtitle: "Cobros, previsión e impagos del espacio.",
      forecastLabel: "Emitido en el periodo",
      collectedLabel: "Cobrado",
      pendingLabel: "Pendiente en plazo",
      overdueLabel: "Vencido",
      recurringLabel: "Ingreso recurrente mensual",
      chargesTitle: "Cobros",
      chargesEmptyTitle: "No hay cobros en este periodo",
      chargesEmptyReason: "Cuando se emita una mensualidad, aparecerá aquí.",
      conceptColumn: "Concepto",
      establishmentColumn: "Restaurante",
      totalColumn: "Total",
      dueColumn: "Vence",
      statusColumn: "Estado",
      nonpaymentTitle: "Restaurantes con impago",
      nonpaymentEmptyTitle: "Ningún impago",
      nonpaymentEmptyReason: "No hay ningún cobro vencido sin saldar.",
      oldestDueColumn: "Vencido desde",
      outstandingColumn: "Deuda viva",
      stageColumn: "Etapa",
      registerTitle: "Registrar un pago",
      registerAmountLabel: "Importe cobrado",
      registerDateLabel: "Fecha del cobro",
      registerReceiptLabel: "Justificante (opcional)",
      receiptColumn: "Justificante",
      receiptNone: "Sin justificante",
      registerMethodLabel: "Método",
      registerSubmit: "Registrar el pago",
      registerPending: "Registrando…",
      registerAmountInvalid: "Escribe el importe cobrado en euros, mayor que cero.",
      registerDateInvalid: "Elige la fecha en que se cobró.",
      registerChargeMissing: "Este cobro ya no existe o no tienes acceso a él.",
      registerDone: "Pago registrado.",
      noPermissionTitle: "Sin acceso a finanzas",
      noPermissionReason:
        "Solo el propietario y los administradores ven las finanzas del espacio.",
    },
    methods: {
      transfer: "Transferencia",
      bizum: "Bizum",
    },
    chargeStates: {
      pending: "Pendiente",
      partially_paid: "Pagado en parte",
      paid: "Pagado",
      overdue: "Vencido",
      waived: "Perdonado",
      refunded: "Reembolsado",
    },
    dunningStages: {
      current: "Al día",
      paused: "Pausado",
      suspended: "Suspendido",
    },
    // Los cuatro motivos de bloqueo que admite el servidor
    // (blocks.reason_type), con un solo nombre visible cada uno (CA-21).
    blockReasons: {
      client_information: "Esperando información del restaurante",
      external_incident: "Incidencia externa",
      authorized_pause: "Pausa autorizada",
      financial_hold: "Impago del restaurante",
    },
  },

  clientArea: {

    // Decisión de Bosco (10/09/2026): el restaurante con plan que lo
    // conceda ordena sus cambios pendientes por importancia.
    priority: {
      title: "Orden de importancia",
      hint: "Coloca primero el cambio que más te corre. El equipo lo verá en ese orden.",
      position: (index: number, total: number) => `${index} de ${total}`,
      moveUp: (what: string) => `Subir: ${what}`,
      moveDown: (what: string) => `Bajar: ${what}`,
      emptyTitle: "No tienes cambios pendientes",
      emptyReason:
        "Cuando pidas un cambio y esté esperando, aparecerá aquí para que digas cuánto te corre.",
      notAllowed:
        "Ordenar los cambios por importancia va incluido en el plan Premium. Con tu plan actual el equipo los atiende por orden de llegada.",
      /*
       * Decisión de Bosco (12/09/2026): "si un trabajo ya se está haciendo
       * no se puede mover, no se puede reordenar".
       *
       * No se esconden: un cambio que el restaurante pidió y que
       * desapareciera de esta pantalla se lee como "se ha perdido". Se
       * enseñan aparte, sin flechas, y con el motivo escrito — que es lo
       * que CLAUDE.md pide en lugar de un hueco.
       */
      inProgressTitle: "Ya se están haciendo",
      inProgressReason:
        "Estos cambios ya los ha comenzado el equipo, así que no se mueven de sitio: nadie va a parar un trabajo empezado para adelantar otro.",
      back: "Volver al restaurante",
    },
    title: "Tu restaurante",
    statusLabel: "Estado del servicio",
    allowanceTitle: "Lo que incluye tu plan este ciclo",
    allowanceRenews: (fecha: string) => `Se renueva el ${fecha}`,
    allowanceRemaining: "disponibles",
    allowanceOf: (incluidas: number) => `de ${incluidas}`,
    allowanceEmptyTitle: "Este restaurante no tiene plan con consumos incluidos",
    allowanceEmptyReason:
      "Con el plan Básico o sin plan de mantenimiento, cada cambio se presupuesta aparte.",
    terms: {
      title: "Condiciones de tu plan y servicios",
      hint: "Lo que aceptas al contratar. Cuando se publique una versión nueva, aparecerá aquí para que la leas y la aceptes.",
      pending: (n: number) => `Versión ${n}: pendiente de aceptar`,
      accepted: (n: number, day: string) => `Versión ${n}: aceptada el ${day}`,
      outdated: (accepted: number, current: number) =>
        `Aceptaste la versión ${accepted}. Hay una nueva, la ${current}, pendiente de aceptar`,
      noTerms: "Sin condiciones publicadas",
      noTermsReason: "El equipo no ha publicado condiciones para esto todavía. No tienes nada que aceptar.",
      read: (n: number) => `Leer la versión ${n}`,
      acceptSubmit: (n: number) => `Acepto la versión ${n}`,
      acceptPending: "Aceptando…",
      acceptDone: "Condiciones aceptadas.",
      onlyOwner: "Aceptar las condiciones es del propietario del restaurante.",
      empty: "No tienes plan ni servicios contratados.",
    },
    requestsTitle: "Tus solicitudes",
    requestsEmptyTitle: "Todavía no has pedido nada",
    requestsEmptyReason: "Cuando envíes tu primera solicitud, aparecerá aquí con su estado.",
    codeColumn: "Código",
    descriptionColumn: "Qué pediste",
    stateColumn: "Estado",
    dateColumn: "Fecha",
    newTitle: "Pedir un cambio",
    newDescriptionLabel: "Qué quieres cambiar",
    newDescriptionHelp:
      "Cuéntalo con tus palabras. El equipo lo revisa, te dice de qué tamaño es y tú decides si sigue adelante.",
    newContextLabel: "Dónde está (opcional)",
    newContextHelp: "La página o la sección, si lo sabes.",
    newSubmit: "Enviar solicitud",
    newSubmitPending: "Enviando…",
    newValidationRequired: "Escribe qué quieres cambiar.",
    acceptTitle: "Pendiente de tu aceptación",
    acceptSubmit: "Aceptar y que empiecen",
    acceptPending: "Aceptando…",
    acceptCategory: (categoria: string) => `El equipo lo ha clasificado como: ${categoria}`,
    requestDetailTitle: "Tu solicitud",
    openRequest: "Ver",
    conversationTitle: "Conversación",
    conversationEmptyTitle: "Todavía no hay mensajes",
    conversationEmptyReason: "Escribe aquí si necesitas contar algo más sobre esta solicitud.",
    conversationClosedTitle: "Esta conversación está cerrada",
    conversationClosedReason:
      "La solicitud terminó o se cerró su ventana de corrección. Si necesitas algo más, pide un cambio nuevo.",
    messageLabel: "Tu mensaje",
    messageSubmit: "Enviar",
    messagePending: "Enviando…",
    maintenanceTeam: "Equipo de mantenimiento",
    you: "Tú",
    edited: "Editado",
    proposalTitle: "Lo que propone el equipo",
    proposalCategory: "Tamaño del cambio",
    declineTitle: "No seguir adelante",
    declineHint: "Puedes decir por qué, y así el equipo sabe qué revisar.",
    declineLabel: "Motivo (opcional)",
    declineSubmit: "No seguir adelante",
    declinePending: "Enviando…",
    infoNeededTitle: "El equipo necesita saber algo",
    infoNeededHint: "Mientras no respondas, el contador de primera atención está detenido.",
    infoAnswerLabel: "Tu respuesta",
    infoAnswerSubmit: "Responder",
    infoAnswerPending: "Enviando…",
    acceptRevisedTitle: "Han cambiado el alcance",
    acceptRevisedHint: "Vuelve a leerlo antes de aceptar: las condiciones son nuevas.",
    acceptRevisedSubmit: "Aceptar el nuevo alcance",
    acceptRevisedPending: "Aceptando…",
    correctionTitle: "Pedir una corrección",
    correctionHint:
      "Tienes una corrección mínima gratuita por trabajo, dentro de la ventana que se abre al publicar.",
    correctionLabel: "Qué hay que corregir",
    correctionSubmit: "Pedir la corrección",
    correctionPending: "Pidiendo…",
    // RN-ARC-04, el otro extremo de "Compartido con el restaurante": lo
    // que el equipo comparte y lo que el propio restaurante sube. Lo
    // interno del equipo no está aquí, y no por estar escondido — RLS no
    // le devuelve la fila.
    filesTitle: "Archivos",
    filesHint:
      "Lo que el equipo comparte contigo y lo que envías tú. Cada descarga usa un enlace privado que caduca a los pocos minutos.",
    filesEmptyTitle: "Todavía no hay archivos",
    filesEmptyReason:
      "Aquí aparecerán los archivos que el equipo comparta contigo —logos, fotografías, menús, documentos— y los que envíes tú. Lo que el equipo guarda para su trabajo interno no se comparte solo.",
    filesNameColumn: "Nombre",
    filesCategoryColumn: "Tipo",
    filesDateColumn: "Fecha",
    // §66.3 · la conversación general del restaurante: lo que todavía no
    // es una solicitud. Es a donde lleva "Mensajes" en el menú del
    // restaurante.
    establishmentConversationTitle: "Mensajes con el equipo",
    establishmentConversationHint:
      "Para lo que todavía no es una solicitud: dudas, avisos y cosas sueltas. Si hace falta un cambio, pídelo como solicitud para que empiece a contar el plazo.",
    establishmentConversationEmptyTitle: "Todavía no hay mensajes",
    establishmentConversationEmptyReason:
      "Escribe aquí lo que quieras contarle al equipo y que no sea todavía una solicitud.",
    // §68 · RN-MSG-10 · convertir la conversación general en solicitud, y
    // revisar el borrador antes de enviarlo. Los tres apartados de la
    // pantalla de revisión son los tres que nombra §68 —alcance,
    // destinatario y archivos—, en su orden.
    convertLink: "Convertir en solicitud",

    /*
     * RN-EST-11 · el propietario de un restaurante edita sus datos de
     * contacto y fiscales. La otra mitad de la regla está en la ficha del
     * equipo; esta es la del cliente, y quién puede de verdad lo contesta
     * el servidor (`client_can_edit_establishment_data()`).
     */
    dataTitle: "Datos de tu restaurante",
    convertTitle: "Convertir en solicitud",
    convertSubtitle:
      "Elige los mensajes que cuentan lo que necesitas. Con ellos se prepara un borrador que podrás revisar antes de enviarlo: hasta que lo envíes, el equipo no ve ninguna solicitud ni empieza a contar el plazo.",
    convertChooseLabel: "Mensajes que van a la solicitud",
    convertContextLabel: "Dónde está (opcional)",
    convertContextHelp: "La página o la sección, si lo sabes.",
    convertSubmit: "Preparar el borrador",
    convertPending: "Preparando…",
    convertValidationRequired: "Elige al menos un mensaje.",
    convertEmptyTitle: "Esta conversación todavía no tiene mensajes",
    convertEmptyReason:
      "Escribe primero lo que necesitas en la conversación con el equipo y después conviértelo en solicitud.",
    convertAttachmentsNote: (cuantos: number) =>
      cuantos === 1
        ? "Lleva 1 archivo adjunto"
        : `Lleva ${cuantos} archivos adjuntos`,
    convertBack: "Volver a tu restaurante",

    draftTitle: "Borrador de solicitud",
    draftSubtitle:
      "Todavía no se ha enviado. Repasa lo que pides, para qué restaurante es y qué archivos lo acompañan; cuando lo envíes, el equipo lo recibe y empieza a contar el plazo de primera atención.",
    draftFromConversation: "Sale de tu conversación general con el equipo",
    draftOpenConversation: "Ver la conversación",
    draftScopeTitle: "1. Alcance: qué pides",
    draftScopeHint:
      "Es el texto de los mensajes que elegiste, tal cual. Reescríbelo si hace falta: se guarda cada versión.",
    draftScopeSave: "Guardar el alcance",
    draftScopeSaving: "Guardando…",
    draftScopeSaved: "Alcance guardado",
    draftScopeUnchanged: "No has cambiado nada.",
    draftScopeVersion: (numero: number) => `Versión ${numero} del texto`,
    draftRecipientTitle: "2. Destinatario: para quién es",
    draftRecipientTeam: "La atiende el equipo de mantenimiento de tu espacio.",
    draftRecipientFixed:
      "Una solicitud es siempre de un restaurante, y este borrador sale de la conversación de este. Si te has equivocado de restaurante, conviértelo desde el suyo.",
    draftFilesTitle: "3. Archivos: qué lo acompaña",
    draftFilesHint:
      "Vinieron con los mensajes que elegiste. Quita los que no vengan a cuento y añade los que falten: quitarlos de aquí no los borra, siguen en tu conversación.",
    draftFilesEmptyTitle: "Este borrador no lleva archivos",
    draftFilesEmptyReason:
      "Ni los mensajes que elegiste traían adjuntos ni has añadido ninguno. Puedes enviarlo así.",
    draftFileRemove: "Quitar del borrador",
    draftFileRemoving: "Quitando…",
    draftFileAdd: "Añadir un archivo",
    draftFileAdding: "Añadiendo…",
    draftSubmitTitle: "Enviar la solicitud",
    draftSubmitHint:
      "Al enviarla, el equipo la recibe, la clasifica y te dirá de qué tamaño es antes de empezar nada.",
    draftSubmit: "Enviar solicitud",
    draftSubmitPending: "Enviando…",
    draftEmptyScope: "Escribe qué necesitas antes de enviarla.",
    draftAlreadySent: "Esta solicitud ya se envió.",
    draftNotFoundTitle: "Este borrador no existe o no es tuyo",
    draftNotFoundReason:
      "O se envió ya, o no tienes acceso a él. Vuelve a tu restaurante para ver tus solicitudes.",
    correctionUsedTitle: "Ya has usado la corrección de este trabajo",
    correctionUsedReason:
      "La corrección mínima gratuita es una por trabajo. Para algo más, pide un cambio nuevo.",
    billingTitle: "Tu facturación",
    billingSubtitle: "Tus cuotas, lo que has pagado y lo que queda pendiente.",
    billingEmptyTitle: "Todavía no hay cobros",
    billingEmptyReason: "Cuando se emita tu primera mensualidad, aparecerá aquí.",
    billingConceptColumn: "Concepto",
    billingTotalColumn: "Total",
    billingDueColumn: "Vence",
    billingStatusColumn: "Estado",
    billingOutstandingColumn: "Pendiente",
    ledgerTitle: "Tus consumos",
    ledgerEmptyTitle: "Todavía no has consumido nada",
    ledgerEmptyReason: "Aquí aparecerá cada cambio que descuente de tu plan, con su motivo.",
    ledgerDateColumn: "Fecha",
    ledgerCategoryColumn: "Categoría",
    ledgerAmountColumn: "Movimiento",
    ledgerReasonColumn: "Motivo",
    ledgerRequestColumn: "Solicitud",
    billingLink: "Ver tu facturación",
    billingNoAccessTitle: "Sin acceso a la facturación",
    billingNoAccessReason:
      "Las cuentas de este restaurante las ve su propietario, y quien él autorice expresamente.",
    // RN-FIN-06: el restaurante sube el justificante; la **confirmación**
    // del cobro sigue siendo del equipo. Que se suba uno no salda nada, y
    // la pantalla lo dice para que nadie se quede esperando.
    receiptTitle: "Enviar un justificante",
    receiptHint:
      "Sube el resguardo de la transferencia o del Bizum. El equipo confirma el cobro cuando lo comprueba: subirlo no lo da por pagado.",
    receiptChargeLabel: "Cobro",
    receiptSubmit: "Enviar justificante",
    receiptPending: "Enviando…",
    receiptDone: "Justificante enviado.",
    receiptMissingFile: "Elige primero el archivo del justificante.",
    receiptMissingCharge: "Elige a qué cobro corresponde.",
    receiptNothingToSend: "No hay ningún cobro pendiente al que adjuntar un justificante.",
    receiptSentTitle: "Justificantes enviados",
    receiptSentEmpty: "Todavía no has enviado ninguno.",
  },

  sessions: {
    title: "Mis sesiones",
    subtitle: "Los dispositivos y navegadores donde tu cuenta está abierta ahora mismo.",
    current: "Esta sesión",
    device: "Dispositivo",
    lastUsed: "Última actividad",
    ip: "Dirección IP",
    close: "Cerrar sesión",
    closing: "Cerrando…",
    closed: "Sesión cerrada.",
    unknownDevice: "Dispositivo desconocido",
    emptyTitle: "No hay otras sesiones",
    emptyReason: "Tu cuenta solo está abierta en este dispositivo.",
    errorTitle: "No se pudieron cargar tus sesiones",
    errorReason: "Vuelve a intentarlo en un momento.",
    cannotCloseCurrent: "Para cerrar esta sesión usa el botón de salir.",
  },

  calendar: {
    title: "Calendario",
    emptyTitle: "Nada en este periodo",
    emptyReason: "No hay festivos, ausencias ni vencimientos entre estas dos fechas.",
    kinds: {
      holiday: "Festivo",
      absence: "Ausencia",
      correction_window: "Fin de la ventana de corrección",
      charge_due: "Vencimiento de cobro",
    },
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
    monthTitle: (mes: string, anio: number) => `${mes} de ${anio}`,
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    today: "Hoy",
    timeZoneHint: (zona: string) =>
      `Las fechas son las del espacio (${zona}), no las del navegador de quien mira.`,
    dateColumn: "Fecha",
    kindColumn: "Qué",
    detailColumn: "Detalle",
    stateColumn: "Estado",
    absenceStates: {
      requested: "Pedida",
      approved: "Aprobada",
      rejected: "Rechazada",
      cancelled: "Cancelada",
    },
    noDetail: "Sin detalle",

    // HU-31 · aprobar una ausencia y ver qué trabajos quedan sin cobertura.
    pendingTitle: "Ausencias pendientes de decidir",
    pendingEmpty: "No hay ninguna ausencia esperando decisión.",
    pendingPersonColumn: "Quién",
    pendingRangeColumn: "Fechas",
    absenceRange: (desde: string, hasta: string, dias: number) =>
      dias === 1 ? `${desde} · 1 día` : `${desde} → ${hasta} · ${dias} días`,
    uncoveredTitle: "Trabajos que quedarían sin cobertura",
    uncoveredEmpty: "Ninguno: no tiene trabajos vivos que cubrir.",
    uncoveredHint:
      "RN-ASG-12: al aprobarla, esta persona deja de ser candidata mientras dure la ausencia. Estos trabajos hay que reasignarlos.",
    decisionNoteLabel: "Motivo de la decisión (opcional)",
    approve: "Aprobar",
    reject: "Rechazar",
    decidePending: "Guardando…",
    decideDone: "Decisión registrada.",

    // HU-30 · disponibilidad declarada.
    availabilityTitle: "Mi disponibilidad",
    availabilityHint:
      "Sirve para planificación y recomendación (RN-ASG-11): no cambia ningún plazo del restaurante.",
    availabilityLabel: "¿Estás disponible para recibir trabajos?",
    availableYes: "Sí, disponible",
    availableNo: "No disponible ahora mismo",
    availabilityNoteLabel: "Nota (opcional)",
    availabilitySave: "Guardar disponibilidad",
    availabilityPending: "Guardando…",
    availabilityDone: "Disponibilidad guardada.",
    availabilityNotWorker:
      "Esta sección es de quien realiza trabajos. Tu rol en este espacio no recibe asignaciones.",

    // HU-30 · pedir una ausencia.
    newAbsenceTitle: "Pedir una ausencia",
    newAbsenceIntro:
      "La decide el propietario o un administrador. Mientras esté aprobada no se te asignarán trabajos nuevos (RN-ASG-12).",
    absenceStartLabel: "Primer día ausente",
    absenceEndLabel: "Último día ausente",
    absenceReasonLabel: "Motivo (opcional)",
    absenceSubmit: "Pedir la ausencia",
    absencePending: "Enviando…",
    absenceDone: "Ausencia pedida. Aparecerá en el calendario hasta que la decidan.",
    absenceStartInvalid: "El primer día no es una fecha válida.",
    absenceEndInvalid: "El último día no es una fecha válida.",
    absenceEndBeforeStart: "El último día no puede ser anterior al primero.",
    absenceTooLong: "Ese rango pasa de un año. Revisa las fechas.",
    myAbsencesTitle: "Mis ausencias",
    myAbsencesEmpty: "No has pedido ninguna ausencia.",

    // HU-32 · festivos y cierres del espacio.
    newHolidayTitle: "Añadir un festivo",
    newHolidayIntro:
      "El reloj contractual se para el día completo (RN-CLK-03). Un festivo no se edita ni se borra: RN-CLK-10 impide que un cambio recalcule hacia atrás contadores ya en curso.",
    holidayDateLabel: "Día",
    holidayNameLabel: "Nombre",
    holidaySubmit: "Añadir el festivo",
    holidayPending: "Guardando…",
    holidayDone: "Festivo añadido.",
    holidayDateInvalid: "Ese día no es una fecha válida.",
    holidayNameRequired: "Ponle nombre: es lo que se verá en el calendario.",
    holidayDuplicate: "Ya hay un festivo ese día en este espacio.",
    holidaysTitle: "Festivos del espacio",
    holidaysEmpty: "Todavía no hay ningún festivo configurado.",

    back: "Volver al calendario",
  },

  /**
   * HU-29 y RN-SUP · la pantalla de Equipo. Los textos de invitar viven en
   * `space.team` desde el Hito 2 y no se duplican aquí: son los mismos.
   */
  teamPage: {
    intro:
      "Quién está en el espacio y quién supervisa a quién. La supervisión no es un rol: es una relación Administrador–Trabajador (RN-SUP-01).",
    membersTitle: "Personas del espacio",
    nameColumn: "Quién",
    roleColumn: "Rol",
    statusColumn: "Estado",
    principalColumn: "Administrador principal",
    substituteColumn: "Sustituto vigente",
    roles: {
      owner: "Propietario",
      admin: "Administrador",
      worker: "Trabajador",
    },
    noPrincipal: "Sin asignar",
    noSubstitute: "Ninguno",
    substituteUntil: (hasta: string) => `hasta el ${hasta}`,

    supervisionTitle: "Supervisión",
    supervisionIntro:
      "Cada trabajador tiene exactamente un administrador principal (RN-SUP-02) y puede tener un sustituto temporal con fechas (RN-SUP-03). Solo el propietario del espacio las cambia (RN-SUP-05).",
    workerLabel: "Trabajador",
    adminLabel: "Administrador",
    setPrincipal: "Asignar principal",
    setPrincipalPending: "Asignando…",
    setPrincipalDone: "Administrador principal asignado.",
    substituteTitle: "Sustitución temporal",
    substituteStartLabel: "Desde",
    substituteEndLabel: "Hasta",
    setSubstitute: "Nombrar sustituto",
    setSubstitutePending: "Nombrando…",
    setSubstituteDone: "Sustitución registrada.",
    substituteWindowInvalid: "La fecha de fin tiene que ser posterior a la de inicio (RN-SUP-03).",
    rescheduleLabel: "Nueva fecha de fin",
    reschedule: "Cambiar la fecha de fin",
    rescheduleDone: "Fecha de fin actualizada.",
    revoke: "Retirar",
    revokeReasonLabel: "Motivo (opcional)",
    revokeDone: "Supervisión retirada.",
    revokeHint: "Retirar no borra nada: la relación se conserva como historial.",

    noWorkers: "Todavía no hay ningún trabajador al que asignar supervisión.",
    noAdmins: "No hay ningún administrador en el espacio al que asignar como supervisor.",
    withoutWorkerHint:
      "Un administrador puede existir sin supervisados: no hace falta asignarle nadie (RN-SUP-06).",
    onlyOwner:
      "Solo el propietario del espacio crea o cambia relaciones de supervisión (RN-SUP-05). Puedes ver quién supervisa a quién, pero no cambiarlo.",
    inviteTitle: "Invitar a alguien al equipo",
    inviteLink: "Invitar a alguien",
    backToTeam: "Volver al equipo",
  },

  /**
   * HU-07 · "asignar un plan y servicios a un establecimiento y ver su
   * ciclo de consumo vigente" (§6 del PRD).
   *
   * Los textos hablan de dinero y de permanencia, así que dicen lo que
   * pasa antes de que pase: cuánto se va a cobrar, cuándo empieza la
   * permanencia nueva y por qué una reducción no se puede todavía. Nada de
   * "no disponible" a secas (P6).
   */
  plansPage: {
    title: "Planes y servicios",
    subtitle: "Qué tiene contratado cada restaurante y qué le queda del ciclo.",
    emptyTitle: "No hay ningún restaurante",
    emptyReason: "Cuando se dé de alta un restaurante, aparecerá aquí con su plan.",
    establishmentColumn: "Restaurante",
    planColumn: "Plan",
    servicesColumn: "Servicios",
    commitmentColumn: "Permanencia",
    renewsColumn: "Renueva",
    manageLink: "Gestionar",
    noPlan: "Sin plan de mantenimiento",
    noPlanHint:
      "Un restaurante sin plan puede pedir cambios: se presupuestan aparte y su primera atención es de 48 h laborables (RN-COM-12).",
    noServices: "Ninguno",
    noCommitment: "Sin permanencia registrada",
    commitmentUntil: "Hasta el",
    commitmentOver: "Cumplida",
    noCycle: "Sin ciclo abierto",
    noAccessTitle: "Sin acceso a los planes de este espacio",
    noAccessReason: "Los planes y servicios de los restaurantes los ve el equipo del espacio.",

    detailTitle: "Plan y servicios",
    backToList: "Volver a planes y servicios",
    currentPlanTitle: "Plan vigente",
    priceLabel: "Precio mensual",
    slaLabel: "Plazo de inicio",
    slaHours: "h laborables",
    includedTitle: "Bolsa del ciclo vigente",
    includedColumn: "Incluidas",
    remainingColumn: "Restantes",
    categoryColumn: "Categoría",
    renewsAtLabel: "Renueva el",
    cycleEmptyTitle: "Este restaurante no tiene ciclo de consumo",
    cycleEmptyReason:
      "El ciclo se abre al asignarle un plan de mantenimiento. Sin plan no hay bolsa: todo se presupuesta aparte (RN-COM-01/12).",

    assignPlanTitle: "Asignar un plan",
    assignPlanHint:
      "Asignar un plan abre su ciclo de consumo y una permanencia de 3 meses (RN-COM-04).",
    planLabel: "Plan",
    assignPlanSubmit: "Asignar el plan",
    assignPlanPending: "Asignando…",
    assignPlanDone: "Plan asignado.",

    // ---- Condiciones versionadas (maqueta 13, decisión del 12/09/2026) --
    terms: {
      catalogueLink: "Condiciones de los planes y servicios",
      catalogueTitle: "Condiciones de los planes y servicios",
      catalogueSubtitle:
        "El texto que cada restaurante acepta al contratar. Publicar es crear una versión nueva: la anterior se conserva, porque hay restaurantes que aceptaron ésa (RN-DAT-07).",
      catalogueNoAccessReason:
        "Las condiciones las publica el propietario del espacio. Aquí se pueden leer; publicarlas no.",
      subjectPlan: "Plan",
      subjectService: "Servicio",
      currentVersion: (n: number, day: string) => `Versión ${n} · publicada el ${day}`,
      noVersion: "Sin condiciones publicadas",
      noVersionReason:
        "Este plan no tiene condiciones todavía. Hasta que se publiquen, ningún restaurante tiene nada que aceptar y su ficha lo dice así.",
      readCurrent: "Leer la versión vigente",
      publishTitle: "Publicar una versión nueva",
      publishHint:
        "Al publicar se avisa al propietario de cada restaurante con este plan o servicio, en Cuotly y por correo, para que lea la versión nueva y la acepte. Los que aceptaron la anterior pasan a tenerla pendiente.",
      publishLabel: "Texto de las condiciones",
      publishSubmit: "Publicar como versión nueva",
      publishPending: "Publicando…",
      publishDone: "Versión publicada.",

      statusTitle: "Condiciones",
      statusNoTerms: "Sin condiciones publicadas para este plan",
      statusPending: (n: number) => `Versión ${n} pendiente de aceptar`,
      statusAccepted: (n: number, day: string) => `Versión ${n} aceptada el ${day}`,
      statusOutdated: (accepted: number, current: number) =>
        `Aceptada la versión ${accepted}; la ${current} está pendiente de aceptar`,
      channelInApp: "en Cuotly",
      channelExternal: "registrada por el equipo, con contrato",
      readLink: "Ver condiciones",
      recordTitle: "Registrar una aceptación de fuera",
      recordHint:
        "Cuando el restaurante ha aceptado estas condiciones por contrato firmado. Hace falta la fecha y el contrato como archivo de este restaurante: sin contrato no se registra.",
      recordDateLabel: "Fecha de aceptación",
      recordFileLabel: "Contrato",
      recordFileNone: "Este restaurante no tiene ningún archivo: sube el contrato en su ficha, en Archivos, y vuelve aquí.",
      recordSubmit: "Registrar la aceptación",
      recordPending: "Registrando…",
      recordDone: "Aceptación registrada.",
      recordNotNeeded: "La versión vigente ya está aceptada.",
    },

    changePlanTitle: "Cambiar de plan",
    changePlanHint:
      "Una mejora se puede cobrar prorrateada ahora mismo (RN-COM-15) o esperar a la renovación (RN-COM-16). Una reducción solo cabe en la renovación y tras cumplir la permanencia (RN-COM-17). En los tres casos empieza una permanencia nueva de 3 meses (RN-COM-05).",
    targetPlanLabel: "Nuevo plan",
    previewSubmit: "Ver qué costaría",
    previewPending: "Calculando…",
    previewTitle: "Lo que costaría la mejora ahora",
    previewDifference: "Se emitirá un cobro de",
    previewFraction: "por la parte del ciclo que queda",
    previewExtras: "Y se añaden a la bolsa:",
    previewNoExtras: "No añade consumos: el plan nuevo no incluye más de ninguna categoría.",
    upgradeNowSubmit: "Mejorar ahora y cobrar la diferencia",
    upgradeNowPending: "Cambiando…",
    upgradeNowDone: "Plan cambiado y diferencia cobrada.",
    scheduleSubmit: "Programar para la renovación",
    schedulePending: "Programando…",
    scheduleDone: "Cambio programado para la renovación.",
    downgradeBlocked:
      "La permanencia vigente no se ha cumplido: esta reducción no se puede programar todavía (RN-COM-17).",
    samePlan: "Ese ya es su plan.",

    scheduledTitle: "Cambio programado",
    scheduledTo: "Pasará a",
    scheduledAt: "en la renovación del",
    scheduledUpgrade: "Mejora",
    scheduledDowngrade: "Reducción",
    cancelScheduledReasonLabel: "Motivo (opcional)",
    cancelScheduledSubmit: "Anular el cambio programado",
    cancelScheduledPending: "Anulando…",
    cancelScheduledDone: "Cambio programado anulado.",
    cancelScheduledHint:
      "Anularlo no borra nada: queda como anulado, y es lo que permite programar otro.",

    servicesTitle: "Servicios adicionales",
    servicesHint:
      "Un restaurante puede tener plan, servicios, o ambos (RN-COM-11). Un mismo servicio no se contrata dos veces.",
    serviceLabel: "Servicio",
    contractServiceSubmit: "Contratar el servicio",
    contractServicePending: "Contratando…",
    contractServiceDone: "Servicio contratado.",
    servicesNoneAvailable: "Este espacio no tiene servicios dados de alta.",
    servicesAllContracted: "Ya tiene contratados todos los servicios del espacio.",
    serviceContractedOn: "Contratado el",
    // P6 · lo que falta se nombra. Las dos cosas que esta pantalla no hace
    // y por qué, en vez de un botón que no funcionaría.
    servicePendingBillingTitle: "La mensualidad de un servicio todavía no se emite",
    servicePendingBillingReason:
      "RN-COM-08 fija dos precios para Menú Diario según el restaurante tenga o no plan Premium, y el sistema todavía no distingue cuál de los planes es Premium. El servicio queda contratado; su cobro mensual llega con Menú Diario (Fase 2).",
    terminationTitle: "Dar de baja un plan o un servicio no se hace aquí",
    terminationReason:
      "La baja del PRD es del restaurante entero (RN-EST-09): se comunica, el servicio sigue hasta el final del periodo pagado o de la permanencia, y después queda 24 h en solo lectura. Qué pasa al cancelar un plan o un servicio sueltos con la permanencia viva no está definido, así que no se ofrece.",
    readOnlyHint:
      "Puedes consultar los planes y servicios, pero no cambiarlos: eso es del propietario o de un administrador (RN-COM-14).",
  },

  /**
   * HU-36 · Ajustes del espacio (§123) y consulta de la auditoría (§21.2).
   *
   * Las secciones que la Fase 1 todavía no tiene no se esconden: se
   * enseñan diciendo por qué no están (P6, CA-20). Un menú de ajustes con
   * cuatro entradas y ninguna explicación hace pensar que el producto no
   * las tendrá nunca.
   */
  settings: {
    title: "Ajustes",
    subtitle: "La configuración del espacio y el rastro de lo que se ha hecho en él.",
    noAccessTitle: "Sin acceso a los ajustes de este espacio",
    noAccessReason: "Los ajustes del espacio los ve el equipo que trabaja en él.",

    identityTitle: "Espacio de mantenimiento",
    identityHint:
      "El nombre es lo que ven el equipo y los restaurantes en toda la aplicación. Cambiarlo queda registrado en la auditoría con quién lo hizo y qué decía antes.",
    nameLabel: "Nombre del espacio",
    nameSubmit: "Guardar el nombre",
    namePending: "Guardando…",
    nameDone: "Nombre guardado.",
    nameUnchanged: "El nombre ya era ese: no se ha registrado ningún cambio.",
    slugLabel: "Dirección del espacio",
    slugHint:
      "La dirección no se cambia: es el enlace por el que entra todo el mundo y los correos ya enviados apuntan a ella.",
    brandLabel: "Identidad visual",
    brandValue: "Emerald Control · Cuotly · by Restavor",
    brandHint:
      "El sistema visual, la paleta y la firma no se personalizan (§124): un único modo claro y una única densidad.",
    logoLabel: "Logotipo",
    logoPending:
      "Todavía no se puede subir. El catálogo de archivos cuelga siempre de un restaurante (files.establishment_id), así que hoy no existe un archivo que sea del espacio; hace falta esa pieza antes de que este botón haga algo.",

    contractTitle: "Configuración contractual",
    contractHint:
      "Solo el propietario del espacio (§125). La zona horaria es la que usa el reloj contractual para calcular todos los plazos vivos, así que cambiarla exige un motivo y queda auditada.",
    timezoneLabel: "Zona horaria del espacio",
    timezoneReasonLabel: "Motivo del cambio",
    timezoneReasonPlaceholder: "Por qué se cambia la zona horaria",
    timezoneSubmit: "Cambiar la zona horaria",
    timezonePending: "Cambiando…",
    timezoneDone: "Zona horaria cambiada. Los calendarios se han versionado con la fecha de hoy.",
    timezoneUnchanged: "El espacio ya estaba en esa zona horaria.",
    timezoneWarning:
      "Afecta al reloj contractual y al de Menú Diario. El reloj de soporte no se mueve: su zona es Europa/Madrid y es un reloj distinto (§132).",

    paymentTermLabel: "Plazo de pago de las mensualidades (días naturales)",
    paymentTermHint:
      "Días desde que se emite una mensualidad hasta que vence. Pasadas 24 h del vencimiento el restaurante queda pausado por impago, y a las 72 h suspendido (RN-FIN-10 y RN-FIN-11).",
    paymentTermSubmit: "Guardar el plazo de pago",
    paymentTermPending: "Guardando…",
    paymentTermDone:
      "Plazo de pago guardado. Se aplica a las mensualidades futuras: las ya emitidas conservan su vencimiento.",
    paymentTermUnchanged: "El plazo de pago ya era ese.",

    fixedRulesTitle: "Lo que no se configura, y por qué",
    fixedRules: [
      "Permanencia de mantenimiento: 3 meses, fijada por RN-COM-04. No hay bolsas de horas.",
      "Ventanas del reloj contractual: lunes a viernes desde las 09:00, fijadas por RN-CLK-01 y RN-CLK-02.",
      "Reglas de consumo: las que trae cada plan (RN-CON), no un umbral que se ajuste aquí.",
      "Impuestos y retenciones: pendientes de la revisión legal y fiscal, que no se inventa.",
    ],

    calendarTitle: "Horario y calendario",
    calendarHint:
      "Los festivos y cierres del espacio se gestionan en el calendario, con su auditoría (HU-32).",
    calendarLink: "Ir al calendario",
    calendarKindColumn: "Calendario",
    calendarZoneColumn: "Zona horaria",
    calendarSinceColumn: "Vigente desde",
    calendarKinds: {
      contractual: "Contractual (plazos de inicio y ejecución)",
      support: "Soporte humano",
      menu_diario: "Menú Diario",
    },
    calendarEmpty: "Este espacio no tiene ninguna versión de calendario registrada.",

    accountTitle: "Mi cuenta y seguridad",
    accountHint:
      "Las sesiones abiertas de tu cuenta, con cierre remoto (HU-05). Están fuera del espacio porque son tuyas, no suyas.",
    sessionsLink: "Ver mis sesiones",

    notificationsTitle: "Notificaciones",
    notificationsHint:
      "Qué avisos quieres recibir en la aplicación y por correo. Es una preferencia tuya en este espacio, no del espacio entero.",
    notificationsEvent: "Aviso",
    notificationsInApp: "En la aplicación",
    notificationsEmail: "Por correo",
    notificationsSubmit: "Guardar preferencias",
    notificationsPending: "Guardando…",
    notificationsDone: "Preferencias guardadas.",
    notificationsMandatory:
      "No se puede desactivar (RN-NOT-03): vencimientos críticos e impagos graves.",

    pendingTitle: "Secciones que todavía no están",
    pendingHint:
      "§123 enumera once secciones de Ajustes. Estas no se han construido, y se dice en vez de enseñar una pantalla vacía.",
    pending: [
      "Apariencia: no habrá selector. Un único modo claro y una única densidad, por decisión de producto (§124).",
      "Facturación e impuestos: depende del bloque legal y fiscal, que revisa un profesional antes de lanzar.",
      "Integraciones: Fase 3, con sus credenciales cifradas.",
      "Suscripción a Cuotly, exportación y conservación: Fase 4.",
      "Propiedad y eliminación del espacio (§127): archivado, transferencia y borrado programado, sin construir.",
      "Auditoría del restaurante: §21.2 dice que el propietario de un restaurante ve la de su establecimiento. Necesita una proyección sin identidad del equipo, como la del libro de consumos, y todavía no existe.",
    ],

    auditTitle: "Auditoría",
    auditSubtitle: "Quién hizo qué, cuándo y con qué motivo. No se edita ni se borra (CA-16).",
    auditLink: "Ver la auditoría del espacio",
    auditBack: "Volver a Ajustes",
    auditWhatYouSee: {
      owner: "Ves la auditoría completa de tu espacio (§21.2).",
      admin:
        "Ves toda la operativa diaria del espacio, finanzas incluidas. Quedan fuera la configuración del espacio y la gestión del equipo —invitaciones, permisos y supervisores—, que son del propietario (§21.2).",
      worker:
        "Ves tus propias acciones y las de los trabajos, solicitudes y archivos que ya puedes ver (§21.2).",
    },
    auditWhenColumn: "Cuándo",
    auditActorColumn: "Quién",
    auditActionColumn: "Qué",
    auditEntityColumn: "Sobre",
    auditChangeColumn: "Cambio",
    auditReasonColumn: "Motivo",
    auditNoActor: "Sistema",
    auditNoReason: "—",
    auditNoChange: "Esta acción no guarda valores.",
    auditChangeArrow: "→",
    auditEmptyTitle: "No hay nada en la auditoría",
    auditEmptyReason:
      "Con estos filtros no hay ninguna acción registrada que tú puedas ver. Prueba a ampliar el periodo.",
    auditFilterFamily: "Tipo de acción",
    auditFilterAll: "Todas",
    auditFilterFrom: "Desde",
    auditFilterTo: "Hasta",
    auditFilterMineOnly: "Solo mis acciones",
    auditFilterSubmit: "Filtrar",
    auditPagePrevious: "Anterior",
    auditPageNext: "Siguiente",
    auditPageLabel: "Página",
    auditTotalLabel: "acciones visibles",

    auditFamilies: {
      space: "Espacio",
      membership: "Equipo",
      supervision: "Supervisión",
      invitation: "Invitaciones",
      charge: "Cobros",
      payment: "Pagos",
      subscription: "Planes y servicios",
      financial: "Finanzas",
      establishment: "Restaurantes",
      establishment_access: "Acceso a restaurantes",
      establishment_note: "Notas internas",
      group: "Grupos de cliente",
      group_access: "Acceso a grupos",
      holiday: "Festivos",
      plan: "Condiciones de planes",
      service: "Condiciones de servicios",
      request: "Solicitudes",
      job: "Trabajos",
      task: "Tareas",
      file: "Archivos",
      absence: "Ausencias",
      correction: "Correcciones",
      session: "Sesiones",
    },

    auditEntities: {
      space: "Espacio",
      establishment: "Restaurante",
      group: "Grupo",
      request: "Solicitud",
      job: "Trabajo",
      task: "Tarea",
      file: "Archivo",
      charge: "Cobro",
      payment: "Pago",
      subscription: "Suscripción",
      absence: "Ausencia",
      correction: "Corrección",
      supervision: "Supervisión",
      holiday: "Festivo",
      plan: "Plan",
      service: "Servicio",
      session: "Sesión",
      space_invitation: "Invitación",
      space_membership: "Pertenencia al equipo",
    },

    auditActions: {
      "absence.decided": "Ausencia resuelta",
      "absence.requested": "Ausencia pedida",
      "charge.invoice_attached": "Factura adjuntada al cobro",
      "charge.issued": "Cobro emitido",
      "charge.receipt_uploaded": "Justificante subido",
      "charge.refunded": "Cobro reembolsado",
      "charge.waived": "Cobro perdonado",
      "correction.completed": "Corrección terminada",
      "correction.requested": "Corrección pedida",
      "correction.started": "Corrección comenzada",
      "correction.team_error_opened": "Corrección por error del equipo",
      "establishment.created": "Restaurante dado de alta",
      "establishment.data_changed": "Datos del restaurante editados",
      "establishment.status_changed": "Estado del restaurante cambiado",
      "establishment_access.granted": "Acceso a un restaurante concedido",
      "establishment_access.revoked": "Acceso a un restaurante revocado",
      "establishment_note.created": "Nota interna escrita",
      "establishment_note.archived": "Nota interna archivada",
      "file.archived": "Archivo archivado",
      "file.deletion_requested": "Borrado de archivo solicitado",
      "file.registered": "Archivo registrado",
      "file.shared_with_client": "Archivo compartido con el restaurante",
      "file.version_added": "Nueva versión de un archivo",
      "group.created": "Grupo de cliente creado",
      "group_access.granted": "Acceso a un grupo concedido",
      "group_access.revoked": "Acceso a un grupo revocado",
      "holiday.created": "Festivo añadido",
      "invitation.accepted": "Invitación aceptada",
      "job.assigned": "Trabajo asignado",
      "job.blocked": "Trabajo bloqueado",
      "job.completed": "Trabajo terminado",
      "job.evidence_attached": "Evidencia de publicación adjuntada",
      "job.published": "Trabajo publicado",
      "job.reassigned": "Trabajo reasignado",
      "job.reassignment_requested": "Reasignación pedida",
      "job.required_specialty_changed": "Especialidad requerida cambiada",
      "job.started": "Trabajo comenzado",
      "job.unblocked": "Trabajo desbloqueado",
      "membership.perform_jobs_changed": "Permiso de ejecutar trabajos cambiado",
      "payment.registered": "Pago registrado",
      "payment.reversed": "Pago revertido",
      "request.accepted": "Solicitud aceptada",
      "request.accepted_again": "Solicitud aceptada de nuevo",
      "request.cancelled": "Solicitud cancelada",
      "request.classification_validated": "Clasificación validada",
      "request.classified": "Solicitud clasificada",
      "request.converted_from_conversation": "Solicitud creada desde una conversación",
      "request.copied": "Solicitud copiada",
      "request.declined_by_client": "Solicitud no continuada por el restaurante",
      "request.draft_created": "Borrador de solicitud creado",
      "request.draft_file_attached": "Archivo añadido al borrador",
      "request.draft_file_detached": "Archivo quitado del borrador",
      "request.draft_updated": "Alcance del borrador revisado",
      "request.information_provided": "Información aportada",
      "request.information_requested": "Información pedida",
      "request.new_acceptance_requested": "Nueva aceptación pedida",
      "request.priority_set": "Cambios ordenados por importancia",
      "request.rejected": "Solicitud rechazada",
      "request.submitted": "Solicitud enviada",
      "session.revoked": "Sesión cerrada",
      "space.created": "Espacio creado",
      "space.payment_term_changed": "Plazo de pago cambiado",
      "space.renamed": "Espacio renombrado",
      "space.timezone_changed": "Zona horaria cambiada",
      "subscription.plan_change_cancelled": "Cambio de plan anulado",
      "subscription.plan_change_scheduled": "Cambio de plan programado",
      "subscription.plan_changed": "Plan cambiado",
      "subscription.plan_created": "Plan dado de alta",
      "subscription.service_created": "Servicio contratado",
      "subscription.terms_accepted": "Condiciones aceptadas por el restaurante",
      "subscription.terms_recorded": "Aceptación externa de condiciones registrada",
      "plan.conditions_published": "Condiciones del plan publicadas",
      "service.conditions_published": "Condiciones del servicio publicadas",
      "supervision.principal_set": "Supervisor principal asignado",
      "supervision.revoked": "Supervisión revocada",
      "supervision.substitute_rescheduled": "Sustituto reprogramado",
      "supervision.substitute_set": "Sustituto asignado",
      "task.assigned": "Tarea repartida",
      "task.cancelled": "Tarea cancelada",
      "task.created": "Tarea creada",
      "task.planned_date_set": "Fecha prevista de una tarea cambiada",
      "task.reassigned": "Reasignación de tarea aprobada",
      "task.reassignment_rejected": "Reasignación de tarea rechazada",
      "task.reassignment_requested": "Reasignación de tarea solicitada",
      "task.state_changed": "Estado de una tarea cambiado",
    },
  },

  /**
   * §20.3 · la pantalla "Más" de la barra de móvil. No tiene contenido
   * propio: enseña los destinos que `moreDestinations()` deja fuera de los
   * cinco. Si algún día caben todos, esta pantalla se queda con las dos
   * acciones de cuenta y nada más, y eso también es cierto.
   */
  morePage: {
    title: "Más",
    subtitle: "Los destinos que no caben en los cinco de la barra inferior.",
  },

  /**
   * §20.2 · "En Fase 1, Menú Diario e Informes muestran su estructura con
   * el estado vacío correspondiente."
   *
   * "Estructura" son las tres familias que el ROADMAP fija para la Fase 3,
   * nombradas. El estado vacío no es "sin datos todavía": es que no está
   * construido, y decir lo primero sería mentir sobre el motivo (CA-20).
   * Ni una cifra de ejemplo, ni una gráfica de relleno (CLAUDE.md MUST NOT).
   */
  reportsPage: {
    title: "Informes",
    subtitle: "La estructura de la Fase 3. Todavía no se genera ningún informe.",
    phaseTitle: "Por qué esta pantalla está vacía",
    phaseReason:
      "Los informes son de la Fase 3: llegarán con flujo de aprobación, versiones, PDF, CSV y envío programado. En la Fase 1 esta pantalla solo enseña su estructura, así que aquí no hay ningún informe que abrir ni ninguna cifra que leer.",
    operationTitle: "Operación",
    operationEmpty: "Sin informes de operación",
    financeTitle: "Finanzas",
    financeEmpty: "Sin informes de finanzas",
    digitalTitle: "Rendimiento digital",
    digitalEmpty: "Sin informes de rendimiento digital",
    notBuiltReason: "No está construido. Llega en la Fase 3.",
    digitalNotBuiltReason:
      "No está construido. Llega en la Fase 3 y depende de las integraciones analíticas, que tampoco existen todavía (PRD §24.1).",
  },

  /**
   * §20.2, la otra mitad de la misma frase. La estructura de Menú Diario
   * sale del alcance de la Fase 2 del ROADMAP y de §6.2; los números que
   * se citan (30 actualizaciones, tres plantillas) son RN-COM-09 y
   * RN-COM-10, no invenciones — y se cuentan en prosa, no como contadores
   * a cero que parecerían un dato real.
   */
  dailyMenuPage: {
    title: "Menú Diario",
    subtitle: "La estructura de la Fase 2. Todavía no hay ningún menú.",
    phaseTitle: "Por qué esta pantalla está vacía",
    phaseReason:
      "Menú Diario es el servicio de la Fase 2: 30 actualizaciones por ciclo (RN-COM-09) y tres plantillas iniciales (RN-COM-10), con generación de PNG y PDF y publicación manual en LandingSite. En la Fase 1 esta pantalla solo enseña su estructura, así que no hay menús, ni plantillas, ni calendario de publicación.",
    menusTitle: "Menús",
    menusEmpty: "Sin menús",
    templatesTitle: "Plantillas",
    templatesEmpty: "Sin plantillas",
    calendarTitle: "Calendario de publicación",
    calendarEmpty: "Sin calendario",
    notBuiltReason: "No está construido. Llega en la Fase 2.",
    clientSubtitle: "El Menú Diario de tu restaurante. Todavía no está disponible.",
    clientPhaseReason:
      "Menú Diario llega en la Fase 2. Cuando esté, aquí verás tus menús, pedirás su publicación y consumirás las actualizaciones del ciclo. De momento no hay nada que enseñar, y preferimos decirlo a enseñarte una pantalla que no hace nada.",
  },

  /**
   * §20.5 · la opción "Nuevo restaurante" del botón Crear, que llevaba a
   * un 404. El formulario es el mismo del Hito 2 que vive en el inicio del
   * espacio; lo que se añade es la ruta.
   */
  newEstablishmentPage: {
    title: "Nuevo restaurante",
    intro: "Completa los datos para crear el establecimiento",
    back: "Volver a Restaurantes",

    generalTitle: "Datos generales",
    nameLabel: "Nombre comercial",
    nameHint: "Es el nombre con el que el restaurante aparece en toda la aplicación.",
    groupLabel: "Grupo de cliente",
    groupNewOption: "Crear un grupo nuevo…",
    groupNameLabel: "Nombre del grupo nuevo",
    groupNameHint:
      "Si ya existe uno con ese nombre, se reutiliza: no se crean dos grupos para el mismo cliente.",
    planLabel: "Plan",
    planNoneOption: "Sin plan por ahora",
    planNoneAvailable:
      "Este espacio no tiene ningún plan definido todavía, así que no hay ninguno que asignar. Se puede contratar después desde la ficha.",
    statusLabel: "Estado",
    statusHint:
      "El restaurante estará en fase de configuración hasta completar la puesta en marcha. El estado se cambia después, desde su ficha.",

    fiscalTitle: "Datos fiscales",
    taxIdLabel: "NIF",
    legalNameLabel: "Razón social",
    addressLabel: "Dirección fiscal",
    postalCodeLabel: "Código postal",
    cityLabel: "Ciudad",

    contactTitle: "Contacto principal",
    contactNameLabel: "Nombre",
    contactNameHint: "Quién responde por el restaurante, del lado del cliente.",
    contactEmailLabel: "Email",
    phonePrimaryLabel: "Teléfono",

    webTitle: "Web y redes",
    websiteLabel: "Sitio web",
    instagramLabel: "Instagram",
    facebookLabel: "Facebook",
    webNotice:
      "Son los enlaces del restaurante, para tenerlos a mano. Darlo de alta aquí no publica ni modifica nada en esas webs (RN-EST-12).",

    submit: "Guardar",
    submitPending: "Creando…",
  },

  agent: {
    title: "Agente Cuotly",
    badge: "Próximamente",
    description:
      "Todavía no está disponible. Cuando lo esté, se anunciará aquí: de momento esta pantalla no hace nada y no hay nada que configurar.",
  },

  /**
   * CA-20 · "Ninguna pantalla muestra números ficticios: sin datos se
   * indica el MOTIVO". Los cuatro motivos del PRD, y ninguno más: si una
   * pantalla no sabe cuál es su caso, es que le falta información, no que
   * necesite un quinto texto genérico.
   */
  /**
   * PRD §15.2 · la ficha del restaurante, con sus cinco pestañas
   * (Resumen · Operación · Informes y datos · Gestión · Historial).
   *
   * Los nombres de estado no están aquí: salen de `naming.states`, igual
   * que en el resto del proyecto (CA-21). Lo que vive aquí son los
   * títulos, las unidades y —sobre todo— los MOTIVOS de cada hueco: la
   * ficha enseña varias cosas que la Fase 1 todavía no calcula, y cada una
   * dice por qué en vez de un cero con pinta de dato (CA-20).
   */
  establishmentSheet: {
    tabs: {
      summary: "Resumen",
      operation: "Operación",
      data: "Informes y datos",
      management: "Gestión",
      history: "Historial",
    },
    tabsLabel: "Secciones de la ficha",
    blocksLabel: "Bloques de gestión",
    blocks: {
      establishmentData: "Datos",
      plan: "Plan",
      payments: "Pagos",
      users: "Usuarios",
      files: "Archivos",
      integrations: "Integraciones",
    },
    // Maqueta 06 · el enlace del encabezado. Solo aparece cuando hay sitio
    // web guardado: un botón que no lleva a ninguna parte es peor que no
    // tenerlo.
    websiteLink: "Ver sitio web",
    websiteLinkNewTab: "(se abre en una pestaña nueva)",
    noAccessTitle: "Esta ficha no es tuya",
    noAccessReason:
      "La ficha interna de un restaurante es del equipo del espacio. Si eres del restaurante, lo tuyo está en su pantalla de inicio.",

    // ---- Resumen -------------------------------------------------
    planTitle: "Plan de mantenimiento",
    planNone: "Sin plan",
    planNoneReason: "Este restaurante no tiene ningún plan contratado (RN-COM-11: el plan es opcional).",
    planPrice: (price: string) => `${price} + IVA / mes`,
    serviceTitle: "Menú Diario",
    serviceContracted: "Contratado",
    serviceNotContracted: "No contratado",
    renewalTitle: "Próxima renovación",
    renewalNone: "Sin ciclo abierto",
    cycleTitle: "Consumos del ciclo",
    cycleRange: (from: string, to: string) => `${from} – ${to}`,
    cycleUsed: (used: number, included: number) => `${used} de ${included} usados`,
    cycleRemaining: (remaining: number) =>
      remaining === 1 ? "queda 1" : `quedan ${remaining}`,
    cyclePercent: (percent: number) => `${percent} %`,
    cycleExhausted: "Bolsa agotada",
    cycleNotIncluded: "No incluido en el plan",
    cycleReturned: (returned: number) =>
      returned === 1 ? "1 devuelto sobre lo incluido" : `${returned} devueltos sobre lo incluido`,
    cycleEmptyTitle: "Sin ciclo de consumo",
    cycleEmptyReason:
      "Los consumos se cuentan sobre el ciclo del plan. Sin plan contratado no hay bolsa que contar.",
    ledgerLink: "Ver el libro de consumos",
    today: (hora: string) => `Hoy, ${hora}`,
    cycleThisMonth: "(este mes)",
    editEstablishment: "Editar restaurante",

    // Maqueta 03 · las cuatro tarjetas del Resumen.
    pendingRequestsTitle: "Solicitudes pendientes",
    pendingRequestsLink: "Ver todas",
    pendingValidationCount: (count: number) =>
      count === 1 ? "solicitud por validar" : "solicitudes por validar",
    pendingRequestsOpen: (count: number) =>
      count === 1 ? "1 solicitud abierta, ninguna esperando validación." : `${count} solicitudes abiertas, ninguna esperando validación.`,
    pendingRequestsEmptyTitle: "Ninguna solicitud abierta",
    pendingRequestsEmptyReason:
      "Cuando este restaurante envíe una solicitud aparecerá aquí hasta que se cierre.",

    currentJobTitle: "Trabajo actual",
    currentJobLink: "Ver trabajos",
    currentJobMore: (rest: number) =>
      rest === 1 ? "y 1 más en marcha" : `y ${rest} más en marcha`,
    currentJobToStart: (remaining: string) => `${remaining} para comenzar`,
    currentJobToFinish: (remaining: string) => `${remaining} para publicar`,
    currentJobOverdue: "Fuera de plazo",
    currentJobNoCounter: "Sin plazo en marcha",
    currentJobEmptyTitle: "Ningún trabajo en marcha",
    currentJobEmptyReason:
      "Aquí aparece el trabajo vivo de este restaurante con el plazo que le corre, en cuanto haya uno.",

    nextMenuTitle: "Próximo menú",
    nextMenuEmptyTitle: "Menú Diario llega con la Fase 2",
    nextMenuEmptyReason:
      "Ni el menú de mañana ni su estado de publicación existen todavía, y el contador de actualizaciones de Menú Diario es aparte del de cambios (RN-CON-02). Los dos se ponen en marcha cuando el servicio empiece a publicar.",

    paymentStatusTitle: "Estado de pago",
    paymentStatusLink: "Ver facturación",
    paymentUpToDate: "Al día",
    paymentUpToDateReason: "Sin cobros pendientes.",
    paymentOwed: (amount: string) => `Debe ${amount}`,
    paymentOwedReason: (overdue: number) =>
      overdue === 0
        ? "Pendiente de cobro, todavía dentro de plazo."
        : overdue === 1
          ? "1 cobro vencido y sin saldar."
          : `${overdue} cobros vencidos y sin saldar.`,
    paymentHiddenTitle: "No se puede mostrar",
    paymentHiddenReason:
      "La facturación de este restaurante no te corresponde (RN-FIN-05). No se dice si hay deuda o no: eso sería afirmar algo sin haber podido mirarlo.",
    attentionTitle: "Necesita atención",
    attentionEmptyTitle: "Nada pendiente en este restaurante",
    attentionEmptyReason:
      "Aquí aparecen sus solicitudes por validar y sus trabajos en riesgo de plazo, en cuanto haya alguno.",
    // La tarjeta de identidad salió de Operación con la vista 04 (los
    // mismos datos se leen enteros en Gestión · Ficha), y con ella sus
    // textos. `identityFieldEmpty` se queda: lo usa la vista de lectura.
    identityFieldEmpty: "Sin rellenar",
    /**
     * Una etiqueta por campo de `IDENTITY_FIELDS` (src/core/establishments.ts),
     * con su misma clave: `establishments.identity-fields.test.ts` falla si
     * sobra o falta alguna, que es lo que evita que un campo nuevo aparezca
     * en pantalla con su nombre en inglés.
     */
    identityFields: {
      legalName: "Razón social",
      taxId: "Identificación fiscal",
      address: "Dirección",
      postalCode: "Código postal",
      city: "Ciudad",
      contactName: "Persona de contacto",
      contactEmail: "Correo de contacto",
      phonePrimary: "Teléfono principal",
      phoneSecondary: "Teléfono secundario",
      websiteUrl: "Sitio web",
      instagram: "Instagram",
      facebookUrl: "Facebook",
      domain: "Dominio",
      webPlatform: "Plataforma web",
      openingHours: "Horario del establecimiento",
    },

    // ---- Gestión · Datos del establecimiento ---------------------
    // RN-EST-12 · el aviso más importante de esta pantalla: aquí se
    // corrige la ficha de Cuotly, no la web del restaurante.
    dataTitle: "Datos del establecimiento",
    dataNotPublicNotice:
      "Editar esta ficha no actualiza la web del restaurante. Un cambio en el contenido público requiere una solicitud (RN-EST-12).",
    dataNameLabel: "Nombre comercial",
    dataNameHint: "Es el nombre con el que el restaurante aparece en toda la aplicación.",
    dataLegalNameLabel: "Nombre fiscal",
    dataTaxIdLabel: "CIF / NIF",
    dataTaxIdHint:
      "Se guarda tal cual, en mayúsculas. Cuotly no comprueba el dígito de control ni emite facturas todavía (RN-FIN-09).",
    dataAddressLabel: "Dirección",
    dataPostalCodeLabel: "Código postal",
    dataCityLabel: "Ciudad",
    dataContactNameLabel: "Persona de contacto",
    dataContactNameHint:
      "Quién responde por el restaurante. Es alguien del cliente, no del equipo de mantenimiento.",
    dataContactEmailLabel: "Email de contacto",
    dataPhonePrimaryLabel: "Teléfono principal",
    dataPhoneSecondaryLabel: "Teléfono secundario",
    dataWebsiteLabel: "Sitio web",
    dataWebsiteHint: "Si se escribe sin https://, se guarda con él.",
    dataInstagramLabel: "Instagram",
    dataInstagramHint: "Se guarda como @usuario, aunque se pegue la dirección entera.",
    dataFacebookLabel: "Facebook",
    dataDomainLabel: "Dominio",
    dataOpeningHoursLabel: "Horario del establecimiento",
    dataOpeningHoursHint:
      "Texto libre, una línea por tramo. No es el calendario laboral del espacio: este horario no mueve ningún plazo.",
    dataWebPlatformLabel: "Plataforma web",
    dataWebPlatforms: {
      unset: "Sin indicar",
      landing_site: "LandingSite de Cuotly",
      other: "Otra plataforma",
    },
    dataWebPlatformHint:
      "El proyecto y el estado de publicación de LandingSite llegan con la Fase 2 (§121): aquí solo se registra cuál usa.",
    dataSubmit: "Guardar cambios",
    dataPending: "Guardando…",
    dataDone: "Datos guardados. La web del restaurante no ha cambiado.",
    dataUnchanged: "No había nada que cambiar: los datos ya eran esos.",
    dataReadOnlyTitle: "Solo lectura",
    dataReadOnlyReason:
      "Los datos fiscales y de contacto los edita el propietario o un administrador del espacio (RN-EST-11). Un trabajador los consulta.",

    // ---- Operación · vista 04, las cuatro tarjetas ---------------
    requestsTitle: "Solicitudes",
    requestsLink: "Ver todas",
    requestsEmptyTitle: "Ninguna solicitud abierta",
    requestsEmptyReason: "Las solicitudes de este restaurante aparecerán aquí mientras estén en curso.",

    jobsTitle: "Trabajos",
    jobsLink: "Ver todos",
    jobsEmptyTitle: "Ningún trabajo en curso",
    jobsEmptyReason: "Cuando se acepte una solicitud y se cree su trabajo, aparecerá aquí.",

    tasksTitle: "Tareas",
    tasksLink: "Ver todas",
    tasksEmptyTitle: "Ninguna tarea abierta",
    tasksEmptyReason:
      "Aquí aparecen las tareas de los trabajos de este restaurante que tu permiso te deja ver: con «Repartir trabajos» son todas, y un trabajador ve las suyas y las de sus trabajos autorizados.",
    tasksUnassigned: "Sin repartir",
    tasksMinutes: (minutes: number) => `${minutes} min`,
    tasksNoJob: "Actividad interna",
    // Maqueta 07 · la columna "Fecha". Sin planificar se dice, no se deja
    // el hueco (CA-20).
    tasksNoDate: "Sin fecha",

    dailyMenuTitle: "Menú Diario",
    dailyMenuEmptyTitle: "Menú Diario llega con la Fase 2",
    dailyMenuEmptyReason:
      "Los menús, su solicitud de publicación y el contador de 30 actualizaciones (RN-CON-02) todavía no existen: son la Fase 2 entera. La maqueta enseña aquí tres menús de ejemplo con sus plazos; en su lugar va el motivo, porque no los está publicando nadie.",

    /**
     * Lo que la tarjeta no está enseñando. Enseñar cuatro de doce sin
     * decirlo es esconder ocho (CA-20).
     */
    cardMore: (rest: number) => (rest === 1 ? "y 1 más" : `y ${rest} más`),

    conversationLink: "Abrir la conversación general",
    codeColumn: "Código",
    descriptionColumn: "Descripción",
    stateColumn: "Estado",
    dateColumn: "Fecha",

    // ---- Informes y datos ----------------------------------------
    countsTitle: "Indicadores operativos",
    countsHint:
      "Fase 1: recuentos de lo que hay, contados sobre las filas de este restaurante. No hay ninguna media, ningún objetivo ni ninguna tendencia — eso son informes, y llegan en la Fase 3.",
    countsRequests: "Solicitudes",
    countsJobs: "Trabajos",
    countsFiles: "Archivos",
    countsByState: "Por estado",
    countsEmptyTitle: "Sin actividad todavía",
    countsEmptyReason: "En cuanto este restaurante tenga solicitudes o trabajos, se contarán aquí.",
    digitalTitle: "Analítica digital",
    digitalEmptyTitle: "No está construida",
    digitalEmptyReason:
      "GA4, Search Console, Business Profile, Clarity y PageSpeed son la Fase 3. No hay ninguna integración conectada, así que no hay ningún dato que enseñar.",

    // ---- Gestión · Plan y servicios (maqueta 13) ------------------
    subscriptionTitle: "Lo contratado",
    planUsageTitle: "Uso incluido en tu plan",
    // RN-COM-04: facturación mensual con renovación automática. No es una
    // promesa de la pantalla, es la regla escrita.
    renewalAutomatic: "Renovación automática",
    renewalNoneHint:
      "El ciclo de consumos se abre al contratar el plan. Sin ciclo no hay fecha de renovación que dar.",
    servicesTitle: "Servicios adicionales",
    servicesNone: "Ninguno",
    servicesNoneReason:
      "Este restaurante no tiene contratado ningún servicio aparte del plan (RN-COM-11: el plan y los servicios son independientes).",
    serviceSince: (day: string) => `Contratado el ${day}`,
    serviceUsageEmptyTitle: "Sin uso que contar todavía",
    serviceUsageEmptyReason:
      "Las actualizaciones de Menú Diario son Fase 2: todavía no se publican desde Cuotly, así que no hay consumo del servicio ni mensualidad emitida.",
    commitmentTitle: "Permanencia",
    commitmentUntil: (day: string) => `Vigente hasta el ${day}`,
    commitmentSince: (day: string) => `Desde el ${day}`,
    commitmentOver: "Cumplida",
    commitmentNone: "Sin permanencia registrada",
    manageplanLink: "Cambiar de plan o contratar servicios",
    termsLabel: "Condiciones",
    termsNoTerms: "sin condiciones publicadas",
    termsPending: (n: number) => `v${n} pendiente de aceptar`,
    termsAccepted: (n: number, day: string) => `v${n} aceptada el ${day}`,
    termsOutdated: (accepted: number, current: number) => `v${accepted} aceptada · v${current} pendiente`,
    termsUnknown: "no se han podido leer",
    termsLink: "Ver condiciones y aceptaciones",

    // ---- Gestión · Pagos y presupuestos (maqueta 14) --------------
    chargesTitle: "Cobros",
    // RN-FIN-08 · los tres importes salen guardados del cobro, con el tipo
    // que regía al emitirlo. La pantalla no multiplica nada.
    baseLabel: "Base imponible",
    taxLabel: (rate: number) => `IVA (${rate} %)`,
    totalLabel: "Total",
    billingPeriod: (from: string, to: string) => `Periodo de facturación: ${from} – ${to}`,
    dueOn: (day: string) => `Vence el ${day}`,
    chargesAllPaidTitle: "Nada pendiente de cobro",
    chargesAllPaidReason:
      "Todas las cuotas emitidas están saldadas. La siguiente se emite en la fecha de renovación del plan (RN-FIN-01).",
    paymentHistoryTitle: "Historial de pagos",
    paymentHistoryEmptyTitle: "Sin pagos registrados",
    paymentHistoryEmptyReason:
      "Aquí aparece cada pago en cuanto alguien lo registre. Los pagos se anotan a mano: no hay pasarela.",
    methodColumn: "Método",
    receiptColumn: "Justificante",
    receiptAttached: "Adjunto",
    receiptNone: "Sin justificante",
    paymentReversed: "Revertido",
    quotesTitle: "Presupuestos",
    quotesEmptyTitle: "No están construidos",
    quotesEmptyReason:
      "Los presupuestos son una entidad preparada y no explotada en Fase 1 (PRD §5.3): todavía no se pueden crear ni enviar, así que no hay ninguno que enseñar.",
    chargesEmptyTitle: "Sin cobros emitidos",
    chargesEmptyReason: "La mensualidad se emite en la fecha de renovación del plan (RN-FIN-01).",
    chargesNoAccessTitle: "Sin acceso a la facturación",
    chargesNoAccessReason:
      "La facturación de un restaurante la ven el propietario, los administradores y el trabajador que lo tiene asignado. RN-ARC-05: los trabajadores no ven los archivos de facturación.",
    conceptColumn: "Concepto",
    amountColumn: "Importe",
    dueColumn: "Vence",
    outstandingColumn: "Pendiente",
    financeLink: "Abrir Finanzas",

    // ---- Gestión · Usuarios --------------------------------------
    usersTitle: "Quién tiene acceso",
    usersEmptyTitle: "Nadie del restaurante tiene acceso todavía",
    usersEmptyReason:
      "Aquí aparecen el propietario global del grupo y las personas del restaurante con su rol, en cuanto se les dé acceso.",
    usersFailedTitle: "No se ha podido leer quién tiene acceso",
    usersFailedReason:
      "La consulta ha fallado. No es que no haya nadie: es que no se ha podido comprobar.",
    personColumn: "Persona",
    accessColumn: "Acceso",
    roleColumn: "Rol",
    permissionsColumn: "Permisos",
    sinceColumn: "Desde",
    sourceGroup: "Propietario global del grupo",
    sourceEstablishment: "Acceso al restaurante",
    clientRoles: {
      global_owner: "Propietario global",
      local_owner: "Propietario local",
      editor: "Editor",
      consulta: "Consulta",
    },
    permissionEditData: "Editar datos",
    permissionViewBilling: "Ver facturación",
    // No es "Solo lectura": eso es el ALCANCE, y desde la maqueta 15 tiene
    // su propia columna al lado. Aquí se dice que no tiene ninguno de los
    // dos permisos finos, que es otra cosa — un Editor sin ellos no es un
    // Consulta.
    permissionsNone: "Ninguno",
    noName: "Sin nombre",
    // Maqueta 15 · "Añadir usuario existente" (RN-EST-04). Existente es
    // literal: en Cuotly se invita al ESPACIO, no a un restaurante.
    grantTitle: "Añadir usuario existente",
    grantHint:
      "Da acceso a este restaurante a alguien que ya tiene cuenta en Cuotly. Si todavía no la tiene, primero hay que invitarle al espacio.",
    grantEmailLabel: "Correo de la persona",
    grantEmailPlaceholder: "nombre@surestaurante.com",
    grantRoleLabel: "Rol",
    grantSubmit: "Dar acceso",
    grantPending: "Dando acceso…",
    grantEditDataLabel: "Puede editar los datos del restaurante (solo se aplica a un Editor).",
    grantViewBillingLabel: "Puede ver la facturación (solo se aplica a un Editor).",
    grantScopeLabel: "Alcance",
    grantScopes: {
      this: "Solo este restaurante",
      allCurrent: "Todos los restaurantes que el grupo tiene ahora mismo",
      allFuture: "Todos los del grupo, incluidos los que se den de alta más adelante (solo Editor)",
    },
    grantFutureHint:
      "El acceso a todo el grupo, futuros incluidos, no lleva permisos finos: escribe en todos sus restaurantes y no ve la facturación.",
    grantDone: (n: number) =>
      n === 1 ? "Acceso concedido." : `Acceso concedido a ${n} restaurantes.`,
    grantDoneFuture:
      "Acceso concedido a todo el grupo, incluidos los restaurantes que se den de alta más adelante.",

    // Maqueta 15 · el alcance es lo que el rol SIGNIFICA (PRD §14), no un
    // permiso guardado: lo deriva `accessScope()` en src/core.
    scopeColumn: "Alcance de acceso",
    accessScopes: {
      full: "Acceso total",
      operational: "Gestión operativa",
      read_only: "Solo lectura",
    },
    actionsColumn: "Acciones",
    revokeSubmit: (name: string) => `Retirar el acceso de ${name}`,
    revokePending: "Retirando…",
    revokeReasonLabel: "Motivo de la retirada",
    revokeReasonPlaceholder: "Motivo (opcional)",
    revokeHint:
      "Retirar un acceso no borra nada: desaparece de inmediato y la actividad histórica permanece (RN-EST-05).",
    usersPendingHint:
      "No hay invitaciones pendientes que enseñar: en Cuotly se invita al espacio, no a un restaurante, y a un usuario del restaurante se le da acceso cuando ya existe, desde «Añadir usuario existente».",

    // ---- Gestión · Usuarios · personal del equipo (maqueta 15) -----
    staffTitle: "Personal operativo asignado",
    staffHint:
      "Quién del equipo tiene autorizado este restaurante (RN-ASG-01). Solo visible internamente: el cliente nunca ve esta lista.",
    staffEmptyTitle: "Nadie asignado todavía",
    staffEmptyReason:
      "Ningún trabajador tiene autorizado este restaurante. Sin nadie autorizado, sus trabajos se quedan en «Pendiente de asignación» (RN-ASG-05).",
    specialtyColumn: "Especialidad",
    specialtyNone: "Sin especialidad declarada",

    // ---- Gestión · Archivos --------------------------------------
    filesTitle: (name: string) => `Archivos de ${name}`,
    filesEmptyTitle: "Sin archivos",
    filesEmptyReason:
      "Aquí aparece el catálogo del restaurante: logos, fotografías, menús, documentos e informes, con sus versiones.",
    // Maqueta 16 · las carpetas del panel izquierdo, con su recuento.
    foldersTitle: "Carpetas",
    foldersAll: "Todos los archivos",
    filesMaxSize: (mb: string) => `Tamaño máximo por archivo: ${mb} MB (RN-ARC-06).`,
    fileNameColumn: "Nombre",
    fileCategoryColumn: "Carpeta",
    fileTypeColumn: "Tipo",
    fileSizeColumn: "Tamaño",
    // El tipo sale del `mime_type` guardado, no de la extensión: un .jpg
    // que en realidad es un PDF diría "JPG" y sería mentira.
    fileTypeUnknown: "No consta",
    fileSizeUnknown: "No consta",
    fileVisibilityColumn: "Visibilidad",
    fileVersionColumn: "Versión",
    fileVersion: (n: number) => `v${n}`,
    fileVariants: {
      original: "Original",
      retouched: "Retocada",
      published: "Publicada",
    },
    // RN-ARC-04 · "un trabajador puede compartir después uno interno".
    // El aviso de que no se deshace no es prudencia decorativa: no existe
    // la operación contraria, ni en el servidor ni en la regla, y el
    // restaurante ya lo habrá visto.
    shareTitle: "Visibilidad",
    shareInternalHint:
      "Este archivo solo lo ve el equipo. Compartirlo lo pone en el catálogo del restaurante, que podrá verlo y descargarlo.",
    shareSharedHint:
      "El restaurante ve este archivo en su catálogo y puede descargarlo.",
    shareIrreversible:
      "Compartir no se deshace: no existe la operación contraria, y para entonces el restaurante ya lo ha visto.",
    shareButton: "Compartir con el restaurante",
    sharePending: "Compartiendo…",
    versionsTitle: "Versiones",
    versionsOf: (name: string) => `Versiones de ${name}`,
    versionsPick: "Elige un archivo para ver sus versiones.",
    versionsClose: "Cerrar el panel de versiones",
    fileSize: (megabytes: string) => `${megabytes} MB`,
    fileArchived: "Archivado",
    uploadHint:
      "El archivo entra en el catálogo de este restaurante. Quién puede subir cada categoría lo decide el servidor: si no te corresponde, te lo dirá al intentarlo.",
    uploadCategoryLabel: "Categoría del archivo",
    // RN-ARC-04 · la marca se elige al subir, y por defecto es la
    // prudente: un archivo compartido sin querer ya lo ha visto el
    // restaurante, y no hay forma de deshacerlo.
    uploadVisibilityLabel: "Quién lo ve",
    uploadVisibilityHint:
      "Puedes compartir después un archivo interno; volver atrás no, así que en la duda déjalo interno.",
    uploadButton: "Subir archivo",
    uploadPending: "Subiendo…",
    uploadDone: (name: string) => `${name} está ya en el catálogo.`,
    // §5.5 de la especificación maestra: "la palabra backup solo puede
    // utilizarse para aquello que realmente sea recuperable". Llamar
    // "Backup de la web" a una tarjeta donde no hay ninguna copia es justo
    // lo que esa regla prohíbe, así que la tarjeta se llama por lo que es.
    backupTitle: "Copias de seguridad web",
    backupEmptyTitle: "No conectado",
    backupEmptyReason:
      "Cuotly no hace copias de la web del restaurante todavía: no hay ninguna integración con el alojamiento, así que no hay fecha de último respaldo que enseñar.",
    // La advertencia de §5.5, que se dice AUNQUE algún día haya copias:
    // solo se respalda lo que la plataforma externa deje exportar.
    backupLimitation:
      "Aunque se conecte, Cuotly solo podrá guardar los contenidos y recursos que la plataforma de la web permita exportar. No afirmará nunca que existe una copia completa restaurable de la web.",

    // ---- Gestión · Integraciones ---------------------------------
    integrationsTitle: "Integraciones",
    integrationsEmptyTitle: "No está construido",
    integrationsEmptyReason:
      "Las integraciones analíticas (GA4, Search Console, Business Profile, Clarity, PageSpeed) son la Fase 3, con OAuth y credenciales cifradas. No hay ninguna conectada y no existe el botón «Sincronizar ahora».",

    // Maqueta 20 · la leyenda de estados vive en el Resumen, y el enlace
    // de cobrar solo aparece cuando hay deuda vencida de verdad.
    statusLegendTitle: "Estados del restaurante",
    registerPaymentLink: "Registrar pago",

    // ---- Historial · actividad y auditoría (maqueta 19) -----------
    historyTitle: "Actividad y auditoría",
    historyHint:
      "Todas las acciones realizadas en este restaurante. Qué acciones se ven aquí lo decide el servidor: cada quien ve las suyas y aquellas sobre las que tiene permiso (§21.2).",
    historyEmptyTitle: "Sin actividad todavía",
    historyEmptyReason:
      "En cuanto alguien haga algo en este restaurante —un cambio en la ficha, una solicitud, un cobro— quedará aquí con su fecha y su autor.",
    historyFilteredEmptyReason:
      "No hay actividad que encaje con estos filtros. Prueba a ampliar el periodo o a quitar alguno.",
    auditWhenColumn: "Fecha y hora",
    auditActionColumn: "Tipo",
    auditChangesColumn: "Cambios",
    auditActorColumn: "Realizado por",
    // Un apunte sin actor no es un hueco: lo escribió el servidor (un
    // barrido, una emisión automática). Decirlo es más honesto que "—".
    auditSystemActor: "Sistema",
    // Hay actor, pero quien mira no puede resolver su nombre. No es el
    // sistema, y decir "Sistema" aquí sería mentir.
    auditUnknownActor: "Sin identificar",
    auditNoValue: "(vacío)",
    auditFromLabel: "Desde",
    auditToLabel: "Hasta",
    auditFamilyLabel: "Tipo de actividad",
    auditActorLabel: "Persona",
    auditAllOption: "Todas",
    auditFilterSubmit: "Filtrar",
    auditPagerLabel: "Moverse por el historial",
    auditPrevious: "Anteriores",
    auditNext: "Siguientes",
    auditPage: (page: number) => `Página ${page}`,
    // PRD §24.1: "exportación e importación masiva" está fuera del alcance
    // de la Fase 1. Un botón que no exporta es peor que no tenerlo.
    auditExportPending:
      "Exportar el historial todavía no está: la exportación masiva queda fuera del alcance de la Fase 1 (PRD §24.1).",
    auditLink: "Ver la auditoría del espacio",
  },

  /**
   * PRD §21.4 · el estado nunca se expresa solo con color: la insignia
   * roja lleva su texto al lado, y debajo queda el motivo largo de
   * siempre.
   *
   * Es una marca, no una función. Las integraciones analíticas y las
   * oportunidades que dependen de ellas son la Fase 3 (PRD §24.1) y aquí
   * no se construye nada de eso: lo único que se dice, en rojo, es que no
   * hay sincronización, que es el hecho cierto hoy.
   */
  analyticsSync: {
    noSyncBadge: "Sin sincronización",
  },

  emptyReasons: {
    not_connected: "No conectado. Falta enlazar el servicio para ver este dato.",
    no_data_yet: "Sin datos todavía. Aparecerán en cuanto haya actividad.",
    error: "No se ha podido cargar. Vuelve a intentarlo.",
    insufficient_period: "Periodo insuficiente. Hace falta más historial para calcular esto.",
  },
} as const;

export type Dictionary = typeof es;
