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
  files: {
    label: "Adjuntar un archivo",
    hint: "Imágenes, PDF, Word, Excel o texto. Hasta 25 MB.",
    choose: "Elegir archivo",
    uploading: "Subiendo…",
    uploaded: "Archivo subido.",
    remove: "Quitar",
    attachmentsTitle: "Archivos adjuntos",
    download: "Descargar",
    rejectedType: "Ese tipo de archivo no se admite. Se aceptan imágenes, PDF, Word, Excel y texto.",
    rejectedSize: "El archivo pasa de 25 MB, que es el máximo por archivo.",
    rejectedEmpty: "El archivo está vacío.",
    rejectedCategory: "Esa categoría de archivo no existe.",
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
    // CA-21: "cada entidad y cada estado se llama igual en escritorio,
    // móvil, correo, PDF e historial". Estas son esas etiquetas para los
    // estados de trabajo y tarea del Hito 6 (src/core/job-states.ts): un
    // único nombre visible por nombre interno, sin sinónimos.
    jobs: {
      states: {
        pending_assignment: "Pendiente de asignación",
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
      taskStates: {
        pending: "Pendiente",
        in_progress: "En curso",
        blocked: "Bloqueada",
        completed: "Completada",
        cancelled: "Cancelada",
      },
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
      edited: "Editado",
      readOnly: "Esta conversación es de solo lectura",
      internalNote: "Nota interna",
      unread: "Sin leer",
    },
    files: {
      internal: "Interno",
      sharedWithClient: "Compartido con el restaurante",
      archived: "Archivado",
      version: "Versión",
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
        in_correction: "En corrección",
        closed: "Cerrada",
        rejected: "Rechazada",
        cancelled_before_start: "Cancelada antes de empezar",
        cancelled_after_start: "Cancelada después de empezar",
      },
      job: {
        pending_assignment: "Pendiente de asignar",
        assigned: "Asignado",
        in_progress: "En curso",
        blocked_by_client: "Bloqueado · Esperando al restaurante",
        authorized_pause: "En pausa autorizada",
        published: "Publicado",
        in_correction: "En corrección",
        completed: "Finalizado",
        cancelled: "Cancelado",
      },
      task: {
        pending: "Pendiente",
        in_progress: "En curso",
        done: "Hecha",
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
    skipToContent: "Saltar al contenido",
    mainLabel: "Contenido principal",
    menuLabel: "Menú del espacio",
  },

  search: {
    open: "Buscar",
    placeholder: "Buscar restaurantes, solicitudes, trabajos…",
    hint: "Ctrl/Cmd + K",
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
     * HU-25 · el libro de consumos de un establecimiento visto por el
     * equipo, que a diferencia del del cliente (`clientArea.ledger*`)
     * lleva **autor**: es lo que pide la historia.
     */
    establishments: {
      title: "Restaurantes",
      subtitle: "Los restaurantes de este espacio.",
      emptyTitle: "No hay ningún restaurante",
      emptyReason: "Cuando se dé de alta un restaurante, aparecerá aquí.",
      nameColumn: "Restaurante",
      codeColumn: "Código",
      statusColumn: "Estado",
      ledgerLink: "Consumos",
      pendingSheetTitle: "La ficha completa todavía no está",
      pendingSheetReason:
        "De la ficha del restaurante solo está el libro de consumos. Las cinco pestañas del PRD llegan más adelante.",
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
    },
    jobs: {
      title: "Trabajos",
      subtitle: "Lo aceptado por los restaurantes, listo para hacerse.",
      emptyTitle: "No hay trabajos",
      emptyReason: "Un trabajo nace cuando un restaurante acepta una solicitud.",
      codeColumn: "Código",
      establishmentColumn: "Restaurante",
      stateColumn: "Estado",
      assigneeColumn: "Responsable",
      categoryColumn: "Categoría",
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
    title: "Tu restaurante",
    statusLabel: "Estado del servicio",
    allowanceTitle: "Lo que incluye tu plan este ciclo",
    allowanceRenews: (fecha: string) => `Se renueva el ${fecha}`,
    allowanceRemaining: "disponibles",
    allowanceOf: (incluidas: number) => `de ${incluidas}`,
    allowanceEmptyTitle: "Este restaurante no tiene plan con consumos incluidos",
    allowanceEmptyReason:
      "Con el plan Básico o sin plan de mantenimiento, cada cambio se presupuesta aparte.",
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
    serviceStoppedTitle: "El servicio de este restaurante está detenido",
    serviceStoppedReason:
      "Mientras esté detenido no se pueden enviar solicitudes nuevas. Si es por un impago, se reactiva al cobrar.",
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
  emptyReasons: {
    not_connected: "No conectado. Falta enlazar el servicio para ver este dato.",
    no_data_yet: "Sin datos todavía. Aparecerán en cuanto haya actividad.",
    error: "No se ha podido cargar. Vuelve a intentarlo.",
    insufficient_period: "Periodo insuficiente. Hace falta más historial para calcular esto.",
  },
} as const;

export type Dictionary = typeof es;
