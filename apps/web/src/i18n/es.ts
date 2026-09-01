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

  contextSelector: {
    title: "Elige un espacio",
    subtitle: "Perteneces a más de un espacio de mantenimiento.",
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
