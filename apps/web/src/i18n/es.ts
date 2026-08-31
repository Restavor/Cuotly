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
} as const;

export type Dictionary = typeof es;
