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
/**
 * Tres formatos que solo usan los informes y que viven aquí porque son
 * texto: "3 h 20 min" es una frase en español, no un número.
 */
function formatoEuros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatoHoras(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/**
 * Las medias de plazos son minutos **laborables** (RN-CLK): decir "3 h"
 * a secas induciría a leerlas como horas de reloj, y no lo son.
 */
function formatoHorasLaborables(minutos: number): string {
  return `${formatoHoras(minutos)} laborables`;
}

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
      // RN-ACC-10 · se retiró "entrar con Google" (decisión 41). Una sola
      // forma de entrar: correo y contraseña.
      noAccount: "¿No tienes cuenta?",
      signupLink: "Solicita acceso",
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
      // El proveedor de correo apagado en el proyecto: nadie puede entrar,
      // y no es la contraseña de quien lo intenta. Decirlo ahorra que
      // media plantilla se ponga a cambiar contraseñas que están bien.
      emailProviderDisabled:
        "Ahora mismo no se puede entrar con correo y contraseña: es una configuración nuestra, no tu contraseña. Escríbenos y lo arreglamos.",
      unknownError:
        "No hemos podido entrar y no sabemos por qué. Vuelve a intentarlo; si sigue pasando, escríbenos.",
    },
    // PRD §37 (RN-ACC) · el formulario de solicitud ocupa el lugar del
    // registro (decisión 41). No hay pantalla donde alguien se cree una
    // cuenta por su cuenta: se pide acceso, y la cuenta llega al aprobarlo.
    signup: {
      title: "Solicita acceso a Cuotly",
      subtitle:
        "Cuéntanos quién eres y qué negocio llevas. Revisamos cada solicitud a mano y te contestamos por correo.",
      contactNameLabel: "Nombre y apellidos",
      businessNameLabel: "Nombre del restaurante o empresa",
      phoneLabel: "Teléfono",
      emailLabel: "Correo electrónico",
      emailHelp: "Ahí te escribiremos, y será el correo de tu cuenta si te damos acceso.",
      commentsLabel: "Comentarios (opcional)",
      commentsHelp: "Qué tienes hoy y qué necesitas. Cuanto más concreto, antes te contestamos.",
      submit: "Enviar solicitud",
      submitPending: "Enviando…",
      hasAccount: "¿Ya tienes cuenta?",
      loginLink: "Entra",
      // A09 · los campos mal rellenados se señalan uno a uno.
      validationRequired: "Faltan datos: revisa los campos marcados.",
      validationEmail: "Ese correo no tiene buena pinta. Revísalo.",
      // A11 · si el envío falla, lo escrito no se pierde.
      unreachable:
        "No hemos podido enviar tu solicitud. Es un problema nuestro o de tu conexión, no de lo que has escrito: sigue aquí y puedes volver a enviarlo.",
      unknownError:
        "No hemos podido enviar tu solicitud y no sabemos por qué. Lo que has escrito sigue aquí; vuelve a intentarlo.",
      // A12 · salir con cambios sin enviar avisa antes.
      leaveWarning: "Has escrito datos que todavía no se han enviado. ¿Seguro que quieres salir?",
      // RN-ACC-12 · la misma respuesta pase lo que pase por detrás.
      doneTitle: "Hemos recibido tu solicitud",
      doneBody:
        "Te escribiremos a ese correo con la respuesta. Guarda el mensaje que acabas de recibir: lleva el enlace donde puedes consultar cómo va.",
      doneBack: "Volver a entrar",
    },
    // RN-ACC-12 · el seguimiento de quien todavía no tiene cuenta, por el
    // enlace con clave que recibió por correo.
    followUp: {
      title: "Tu solicitud de acceso",
      notFound: "Este enlace no vale",
      notFoundBody:
        "O se ha copiado a medias, o la solicitud ya no existe. Si crees que es un error, vuelve a solicitar acceso.",
      statusLabel: "Estado",
      sentOn: "Enviada el",
      decidedOn: "Contestada el",
      states: {
        submitted: "En revisión",
        needs_information: "Necesitamos que nos cuentes algo más",
        approved: "Aprobada",
        rejected: "No aprobada",
      },
      submittedBody: "La estamos revisando. Te escribiremos en cuanto haya respuesta.",
      needsInformationBody: "Esto es lo que necesitamos saber:",
      approvedBody:
        "Te hemos enviado por correo un enlace para poner tu contraseña y entrar. Es de un solo uso y caduca.",
      rejectedBody: "No hemos podido darte acceso. El motivo:",
      yourReply: "Tu respuesta",
      replyLabel: "Responde aquí",
      replySubmit: "Enviar respuesta",
      replySubmitPending: "Enviando…",
      replyRequired: "Escribe la respuesta antes de enviarla.",
      replyDone: "Gracias. Tu solicitud vuelve a la cola de revisión.",
    },
    // RN-ACC-04 · el enlace de un solo uso donde se pone la contraseña.
    setup: {
      title: "Pon tu contraseña",
      subtitle: "Tu acceso a Cuotly está aprobado. Elige una contraseña y entra.",
      emailLabel: "Tu correo",
      emailLocked: "Es el correo que aprobamos. No se puede cambiar aquí.",
      passwordLabel: "Contraseña",
      repeatLabel: "Repite la contraseña",
      submit: "Crear mi cuenta y entrar",
      submitPending: "Creando la cuenta…",
      mismatch: "Las dos contraseñas no coinciden.",
      tooShort: "La contraseña tiene que tener al menos 8 caracteres.",
      usedTitle: "Este enlace ya se ha usado",
      usedBody: "Tu cuenta ya existe. Entra con tu correo y tu contraseña.",
      expiredTitle: "Este enlace ha caducado",
      expiredBody:
        "Por seguridad dura poco. Escríbenos al mismo correo por el que te contestamos y te enviamos uno nuevo.",
      unknownTitle: "Este enlace no vale",
      unknownBody: "O se ha copiado a medias, o nunca existió.",
      goToLogin: "Ir a entrar",
      unknownError:
        "No hemos podido crear tu cuenta y no sabemos por qué. Vuelve a intentarlo; el enlace sigue sirviendo.",
    },
    /**
     * RN-ACC-13 · la TERCERA puerta: alguien a quien invitó su propio
     * restaurante. Casi nunca ha oído hablar de Cuotly, así que las
     * frases dicen de qué va esto antes de pedirle nada.
     */
    panelInvitation: {
      title: "Te han dado acceso a tu panel",
      subtitle: "Elige una contraseña y entra.",
      subtitleWith: (restaurante: string) =>
        `Vas a entrar en el panel de ${restaurante}. Elige una contraseña.`,
      usedTitle: "Este enlace ya se ha usado",
      usedBody: "Tu cuenta ya existe. Entra con tu correo y tu contraseña.",
      expiredTitle: "Este enlace ha caducado",
      expiredBody:
        "Por seguridad dura siete días. Pídele a quien te invitó que te mande uno nuevo.",
      // Propio de esta puerta: la invitación existe, pero el equipo de
      // mantenimiento todavía no la ha mirado (RN-PAN-14). Decir "este
      // enlace no vale" sería mentira.
      pendingTitle: "Tu invitación está en revisión",
      pendingBody:
        "El equipo de mantenimiento tiene que darle el visto bueno. Te avisaremos en cuanto lo haga; guarda este enlace.",
      unknownTitle: "Este enlace no vale",
      unknownBody: "O se ha copiado a medias, o ya no está en pie.",
      unknownError:
        "No hemos podido crear tu cuenta y no sabemos por qué. Vuelve a intentarlo; el enlace sigue sirviendo.",
    },
    // RN-ACC-09 · la otra puerta: la invitación de un propietario.
    invitation: {
      title: "Te han invitado a Cuotly",
      subtitleSpace: "Vas a entrar en",
      emailLabel: "Tu correo",
      emailLocked: "Es el correo al que te invitaron. No se puede cambiar aquí.",
      passwordLabel: "Contraseña",
      repeatLabel: "Repite la contraseña",
      submit: "Crear mi cuenta y entrar",
      submitPending: "Creando la cuenta…",
      hasAccountTitle: "Ya tienes cuenta en Cuotly",
      hasAccountBody: "Entra con tu correo y tu contraseña y te añadimos al espacio.",
      signIn: "Entrar y aceptar",
      expiredTitle: "Esta invitación ha caducado",
      expiredBody: "Pídele a quien te invitó que te mande otra.",
      acceptedTitle: "Esta invitación ya se ha usado",
      acceptedBody: "Entra con tu correo y tu contraseña.",
      cancelledTitle: "Esta invitación se ha cancelado",
      cancelledBody: "Pregunta a quien te invitó.",
      unknownTitle: "Esta invitación no vale",
      unknownBody: "O se ha copiado a medias, o nunca existió.",
      goToLogin: "Ir a entrar",
      unknownError:
        "No hemos podido crear tu cuenta y no sabemos por qué. Vuelve a intentarlo.",
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
      menu: "Menú",
      quote: "Presupuesto",
    },
    // CA-21: las cuatro categorías de cambio (RN-CLS), con un solo nombre
    // visible cada una.
    categories: {
      small: "Cambio pequeño",
      photo: "Fotografía",
      medium: "Cambio mediano",
      large: "Cambio grande",
    },
    // RN-REP-20 · las mismas cuatro en plural, para la bolsa del mes:
    // "Cambio pequeño · 2 de 5" se lee mal, y CA-21 pide un solo nombre
    // visible por categoría, no una sola forma gramatical.
    categoriesPlural: {
      small: "Cambios pequeños",
      photo: "Fotografías",
      medium: "Cambios medianos",
      large: "Cambios grandes",
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
    /**
     * §57 · los cinco tipos de menú de `MENU_KINDS` (src/core/daily-menu.ts).
     * Mismo criterio CA-21 que las especialidades.
     */
    menuKinds: {
      daily: "Diario",
      christmas: "Navidad",
      kids: "Infantil",
      groups: "Grupos",
      special_event: "Evento especial",
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
      /** §63, con los nombres de la especificación maestra. */
      menu: {
        draft: "Borrador",
        prepared: "Preparado",
        publication_requested: "Publicación solicitada",
        pending_assignment: "Pendiente de asignar",
        assigned: "Asignado",
        needs_information: "Falta información",
        reviewing: "Revisando",
        ready_to_publish: "Listo para publicar",
        published: "Publicado",
        cancelled: "Cancelado",
        publication_error: "Error de publicación",
      },
      /**
       * §84 · los cinco estados visibles de un presupuesto. "Aceptado" no
       * está: aceptar es el instante en que nace el cobro, y desde ahí el
       * presupuesto está pendiente de pago o pagado (RN-DAT-05).
       */
      quote: {
        draft: "Borrador",
        sent: "Enviado",
        rejected: "Rechazado",
        pending_payment: "Aceptado · Pendiente de pago",
        paid: "Pagado",
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
    // Fase 4 · Hito 21 · §20.4 nombra "incidencias" en el Inicio del propietario.
    incidentsAwaiting: (n: number) =>
      n === 1 ? "1 incidencia a Cuotly espera algo de ti." : `${n} incidencias a Cuotly esperan algo de ti.`,
    title: "Inicio",
    // El subtítulo dice la verdad de la pantalla, no una consigna fija:
    // con la lista vacía, "Esto necesita tu atención" sería mentira.
    subtitleAttention: "Esto necesita tu atención",
    subtitleClear: "Nada reclama tu atención ahora mismo",
    // Página 22 del diseño definitivo móvil · el saludo y la frase de
    // debajo. Sin nombre se saluda sin él: sacarlo del correo llamaría
    // "Info" a Bosco.
    greeting: (nombre: string) => (nombre === "" ? "Hola," : `Hola ${nombre},`),
    greetingSubtitle: "Aquí tienes un resumen de la actividad de tus restaurantes.",

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
      // Página 22 del diseño · los cinco recuadros y su letra pequeña.
      // Cada pie dice algo que se ha contado de verdad: el diseño pone
      // "+2 que el mes anterior" en las solicitudes pendientes, y eso no
      // se puede saber —un pendiente de hoy no se compara con una foto
      // del mes pasado que nadie guardó—, así que ahí va lo que sí es
      // cierto (CLAUDE.md MUST NOT).
      establishmentsHint: (activos: number, total: number) =>
        activos === total ? `${total} en total` : `${activos} de ${total} en total`,
      requestsHint: "Esperando que alguien las valide o las conteste.",
      inProgress: "Trabajos en curso",
      inProgressHint: (enPlazo: number) =>
        enPlazo === 1 ? "1 en plazo" : `${enPlazo} en plazo`,
      menu: "Publicaciones de menú pendientes",
      menuHint: (sinAsignar: number) =>
        sinAsignar === 0
          ? "Todas con responsable"
          : sinAsignar === 1
            ? "1 sin asignar"
            : `${sinAsignar} sin asignar`,
      menuNotOffered: "Este espacio no vende Menú Diario.",
    },

    // Página 22 · "Estado por restaurante". El diseño dibuja además una
    // barra con un porcentaje; **no se pinta** porque no está definido qué
    // mide, y una barra sin regla detrás es un adorno que se lee como un
    // dato. Cuando se defina qué mide, se añade.
    // Página 22 del diseño definitivo móvil · "Actividad de mantenimiento".
    activityChart: {
      title: "Actividad de mantenimiento",
      requests: "Solicitudes creadas",
      jobs: "Trabajos completados",
      thisMonth: "Este mes",
      // CA-20 · si una de las dos consultas falla, no se dibuja una línea
      // plana: una línea en cero se leería como "no pasó nada".
      failed: "No hemos podido leer la actividad del mes. Vuelve a cargar en un momento.",
      empty: "Todavía no ha pasado nada este mes.",
      // La tabla que acompaña a la gráfica: quien no distinga los colores,
      // quien use lector de pantalla y quien quiera el número exacto leen
      // lo mismo que el dibujo.
      tableCaption: "Actividad del mes, día a día",
      showTable: "Ver los números",
      hideTable: "Ocultar los números",
      columnDay: "Día",
      point: (dia: string, solicitudes: number, trabajos: number) =>
        `${dia}: ${solicitudes} creadas, ${trabajos} completados`,
      /**
       * Las etiquetas del eje horizontal: "1 mar", como las escribe el
       * diseño. El nombre corto del mes va aquí y **no sale de `Intl`**
       * a propósito: la gráfica se pinta también en el navegador, y los
       * datos de idioma del servidor y los del teléfono no tienen por qué
       * coincidir — dos etiquetas distintas para el mismo día rompen la
       * hidratación de React.
       */
      axisDay: (dia: number, mes: number) =>
        `${dia} ${
          ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][
            mes - 1
          ] ?? ""
        }`,
    },

    byRestaurant: {
      title: "Estado por restaurante",
      seeAll: "Ver todos",
      empty: "Todavía no hay ningún restaurante en este espacio.",
      // La barra mide lo que lleva gastado de su bolsa en el ciclo
      // vigente, sumando las cuatro categorías (decisión de Bosco,
      // 20/09/2026). Las otras dos frases son los casos en los que un
      // porcentaje mentiría.
      usage: (usados: number, incluidos: number) =>
        `${usados} de ${incluidos} cambios usados este ciclo`,
      usageLabel: "Bolsa del ciclo",
      nothingIncluded: "Su plan no incluye cambios: todo se presupuesta aparte.",
      noCycle: "Sin ciclo de consumo en marcha.",
    },

    /**
     * Página 22 · "Próximas tareas". Lo que viene por delante, sacado del
     * calendario del espacio: no hay una lista de tareas aparte que
     * pudiera decir otra cosa.
     */
    upcoming: {
      title: "Próximas tareas",
      seeAll: "Ver calendario",
      // Las tres respuestas distintas de CA-20: no se ha podido leer, no
      // hay nada, y —cuando sí hay— la lista.
      failed: "No hemos podido leer el calendario. Vuelve a cargar en un momento.",
      emptyTitle: "No hay nada en el calendario",
      emptyReason:
        "Cuando haya una publicación de menú, un plazo de trabajo, un cobro o una renovación en el próximo mes, aparecerá aquí.",
      /** La fecha corta de la columna izquierda: "2 abr". */
      day: (dia: number, mes: number) =>
        `${dia} ${
          ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][
            mes - 1
          ] ?? ""
        }`,
      today: "Hoy",
    },

    /**
     * Página 22 · "Resumen financiero". Los dos importes NO se nombran
     * aquí: se leen de `space.finance` —"Cobrado" y "Pendiente de cobro"—,
     * que es donde ya se llamaban en la pantalla de Finanzas. Un mismo
     * importe con dos nombres según la pantalla es la forma más fácil de
     * que alguien crea que son dos cosas distintas (CA-21).
     */
    finance: {
      title: "Resumen financiero",
      seeAll: "Ver finanzas",
      thisMonth: "Este mes",
      failed: "No hemos podido leer el resumen financiero. Vuelve a cargar en un momento.",
      // §20.7 · sin permiso se dice eso, no un cero: "0 € cobrado" es una
      // afirmación sobre el dinero del espacio, y quien no puede verlo
      // tampoco puede hacerla.
      noPermissionTitle: "No puedes ver las finanzas de este espacio",
      noPermissionReason:
        "Hace falta el permiso de gestión financiera. Pídeselo a un administrador del espacio.",
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
      openLink: "Ver Menú Diario",
      // Decisión 18: el contador entra en la tarjeta que ya existía. Lo
      // que cuenta son las publicaciones que el equipo tiene entre manos
      // (RN-MEN-09: de "Publicación solicitada" a "Error de publicación")
      // y las correcciones abiertas; sale de `team_menu_queue()`, que lo
      // calcula en el servidor con RLS.
      pending: (n: number) => (n === 1 ? "1 publicación pendiente" : `${n} publicaciones pendientes`),
      pendingHint: "Pedidas por los restaurantes y todavía sin publicar, o publicadas con una corrección abierta.",
      unassigned: (n: number) => (n === 1 ? "1 sin asignar" : `${n} sin asignar`),
      overdue: (n: number) => (n === 1 ? "1 garantizada pasada de hora" : `${n} garantizadas pasadas de hora`),
      // CA-20 · sin servicio no hay cero que enseñar: se dice el motivo.
      noServiceTitle: "Este espacio no ofrece Menú Diario",
      noServiceReason: "No hay ningún servicio de tipo Menú Diario en Planes y servicios.",
      // CA-20 · la consulta falló: el sitio del número lo ocupa el motivo.
      unavailable: "No se ha podido calcular",
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
    // Fase 4 · Hito 21 · el centro de ayuda de §133, para el equipo y para
    // el restaurante.
    help: "Ayuda",
    more: "Más",
    newRequest: "+ Nueva solicitud",
    // Fase 3 · Hito 14 · los dos destinos del restaurante que el diseño
    // del panel (vistas 22 y 25.03) separa de su inicio.
    data: "Informes y datos",
    sources: "Autorizar fuentes",
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
   * §40 (RN-PAN) · el panel del restaurante como contexto propio.
   *
   * El nombre que el restaurante ve arriba es el de SU local, nunca el del
   * espacio de mantenimiento (RN-PAN-03): el espacio es organización
   * interna del equipo y a él no le dice nada. "Panel de restaurante" es la
   * etiqueta que le dice en qué contexto está, igual que al equipo se lo
   * dice el nombre de su espacio.
   */
  restaurantPanel: {
    label: "Panel de restaurante",
    menuLabel: "Menú del panel de restaurante",
    /** RN-PAN-04 · el selector, cuando hay más de uno al que ir. */
    switchLabel: "Cambiar de restaurante",
    switchHint: (cuantos: number) =>
      cuantos === 2 ? "Tienes otro restaurante" : `Tienes ${cuantos} restaurantes`,
    pickerTitle: "Tus restaurantes",
    /**
     * RN-PAN-05 · con uno solo no hay selector. No hay texto que enseñar
     * aquí: se ve el nombre y ya está. La clave existe para el nombre
     * accesible de la caja, que sí tiene que decir qué es.
     */
    singleLabel: (nombre: string) => `${nombre} · Panel de restaurante`,
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
    // §36 · lo único que se crea desde fuera de todo contexto (G01, G02).
    space: "Crear espacio de mantenimiento",
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
      menu_publication_requested: "Menú pendiente de asignar",
      menu_assigned: "Menú asignado",
      menu_needs_information: "Tu menú necesita información",
      menu_published: "Menú publicado",
      menu_publication_error: "Error al publicar un menú",
      menu_not_prepared_reminder: "Mañana no tienes menú preparado",
      menu_publication_overdue: "Un menú garantizado sigue sin publicar pasadas las 08:00",
      quote_sent: "Tienes un presupuesto pendiente de responder",
      quote_accepted: "Presupuesto aceptado",
      quote_rejected: "Presupuesto rechazado",
      integration_sync_failed: "Una integración ha dejado de sincronizar",
      integration_reauthorization_required: "Una integración necesita que vuelvas a autorizarla",
      report_schedule_due_soon: "Un informe se envía mañana",
      report_sent: "Tienes un informe nuevo",
      cuotly_payment_due_soon: "Tu mensualidad de Cuotly vence en 3 días",
      cuotly_payment_due_today: "Tu mensualidad de Cuotly vence hoy",
      cuotly_payment_overdue_24h: "Tu mensualidad de Cuotly lleva 24 h vencida",
      cuotly_payment_overdue_48h: "Tu mensualidad de Cuotly lleva 48 h vencida",
      cuotly_payment_final_notice: "Último aviso: tu espacio se archivará por impago",
      cuotly_space_archived: "Tu espacio está archivado en modo lectura",
      cuotly_space_reactivated: "Tu espacio vuelve a estar activo",
      support_session_started: "Alguien de Cuotly ha entrado en tu espacio en Modo soporte",
      space_ownership_transferred: "El espacio ha cambiado de propietario",
      space_archived_by_owner: "Tu propietario ha archivado el espacio",
      incident_opened: "Nueva incidencia a Cuotly",
      incident_updated: "Tu incidencia ha cambiado de estado",
      incident_replied: "Hay un mensaje nuevo en una incidencia",
      storage_threshold_80: "Has usado el 80 % del almacenamiento incluido en tu plan",
      storage_threshold_100: "Has llegado al 100 % del almacenamiento incluido en tu plan",
      security_incident: "Incidente de seguridad en Cuotly",
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
      // §38, RN-REC-02 · el aviso del día del vencimiento. Dice lo que
      // pasa hoy y no amenaza con lo de pasado mañana: quien no paga ya
      // recibe los otros dos avisos cuando toca.
      charge_due_today: "Hoy vence un cobro tuyo",
      absence_requested: "Ausencia pedida",
      absence_decided: "Ausencia resuelta",
      absence_uncovered_jobs: "Trabajos sin cobertura",
      establishment_access_granted: "Acceso a tu panel",
      // RN-PAN-14 · dos audiencias distintas y dos frases distintas: al
      // equipo se le dice que hay algo que mirar, a quien invitó en qué
      // quedó. Ninguna dice quién la revisó (RN-PAN-15).
      panel_invitation_pending_review: "Invitación al panel por revisar",
      panel_invitation_decided: "Tu invitación al panel, resuelta",
      // RN-INT-10 a 12 · las reseñas de Google. El nombre del aviso bajo
      // dice ya lo que pasa, porque es el que hay que abrir hoy.
      review_received: "Reseña nueva en Google",
      low_review_received: "Reseña baja en Google",
    },
    // RN-MOV-04 (decisión 36) · el push dice qué ha pasado y dónde: el
    // evento, el restaurante y el espacio, la cifra si la hay y una frase
    // de lo que se pide. Nunca el nombre de nadie del equipo.
    push: {
      title: (evento: string, restaurante: string | null) => (restaurante ? `${evento} · ${restaurante}` : evento),
      body: (partes: {
        readonly espacio: string;
        readonly importe: string | null;
        readonly umbral: number | null;
        readonly asunto: string | null;
      }) => {
        const cabecera = [partes.espacio, partes.importe, partes.umbral !== null ? `${partes.umbral} %` : null]
          .filter((x): x is string => x !== null)
          .join(" · ");
        return partes.asunto ? `${cabecera}\n«${partes.asunto}»` : cabecera;
      },
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

  // RN-INT-10 a 12 (migración 117, decisión 60) · la pantalla de reseñas.
  reviewsPage: {
    title: "Reseñas de Google",
    subtitle: "Lo que escriben los clientes en la ficha de Google del restaurante.",
    lowBadge: "Reseña baja",
    reply: "Respondida",
    noComment: "Sin comentario, solo puntuación.",
    stars: (n: number) => (n === 1 ? "1 estrella" : `${n} estrellas`),
    emptyTitle: "Todavía no hay reseñas",
    // CLAUDE.md · nunca un hueco mudo: cada motivo dice qué pasa y qué
    // habría que hacer, y ninguno finge que el dato existe.
    emptyNotWatched:
      "El plan de este restaurante no incluye la vigilancia de reseñas, así que no se descargan.",
    emptyNotConnected:
      "La ficha de Google Business Profile no está conectada: conéctala en Integraciones.",
    emptyNeedsAccount:
      "La conexión guardó la ubicación pero no la cuenta de Google, y las reseñas la necesitan. " +
      "Hay que volver a conectar Business Profile eligiendo la cuenta.",
    emptyNoneYet: "La ficha está conectada y todavía no ha llegado ninguna reseña.",
    noAccessTitle: "No puedes ver este restaurante",
    noAccessReason:
      "Las reseñas son de quien tiene acceso al restaurante. Si crees que deberías tenerlo, pídeselo al equipo.",
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
    // M82 · los grupos de restaurantes, que existían en la base desde el
    // principio y se veían solo de refilón: como una columna del listado y
    // como un desplegable del filtro.
    groups: {
      title: "Grupos de restaurantes",
      subtitle:
        "Un grupo es la empresa cliente: el mismo dueño con varios locales. Quien tiene acceso al grupo lo tiene a todos sus restaurantes.",
      count: (n: number) => (n === 1 ? "1 restaurante" : `${n} restaurantes`),
      accessTitle: "Quién tiene acceso a todo el grupo",
      accessNone:
        "Nadie tiene acceso al grupo entero. Puede haber quien lo tenga a un restaurante suelto: eso se ve en la ficha de cada uno.",
      personUnknown: "Cuenta sin nombre",
      roles: {
        global_owner: "Propietario del grupo",
        editor: "Editor de todos, también de los futuros",
      },
      establishmentsTitle: "Restaurantes del grupo",
      establishmentsNone:
        "Este grupo no tiene ningún restaurante que puedas ver. Si tienes restaurantes autorizados, son de otros grupos.",
      emptyTitle: "Todavía no hay ningún grupo",
      emptyReason:
        "Un grupo nace con su primer restaurante. Cuando des de alta uno y le pongas un nombre de grupo nuevo, aparecerá aquí.",
      howTitle: "Cómo se manejan los grupos",
      howBorn:
        "No se crea un grupo por su cuenta: nace al dar de alta el primer restaurante que lo tiene, escribiendo su nombre. Un grupo vacío no serviría de nada.",
      howAccess:
        "Dar acceso a alguien —a un restaurante, a todos los de hoy, o a todos incluidos los futuros— se hace desde la ficha de cualquier restaurante del grupo, donde están los cuatro casos juntos.",
      backToList: "Volver a la lista de restaurantes",
    },

    establishments: {
      title: "Restaurantes",
      // Página 23 del diseño, literal: dice qué se hace aquí, no qué hay.
      subtitle: "Gestiona tus establecimientos y su mantenimiento digital.",
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
      // Página 23 del diseño · los dos rótulos nuevos de la ficha.
      openRequests: "Solicitudes abiertas",
      noGroup: "Sin grupo",
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
      // RN-REQ-05 · lo que el cliente dijo que le corre. No es el "Orden
      // de importancia" del plan (RN-PRI): aquí se lee cuánto corre ESTA.
      priorityLabel: "Prioridad que pidió",
      priorityLevels: {
        high: "Alta",
        medium: "Media",
        low: "Baja",
      },
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
      // R12 · cancelar por el restaurante, mientras no sea un trabajo.
      cancelTitle: "Cancelar por el restaurante",
      cancelHint:
        "Para cuando el restaurante llama y se arrepiente. Solo mientras no sea un trabajo: después, la cancelación es la del trabajo, que devuelve lo consumido.",
      cancelLabel: "Motivo (opcional)",
      cancelSubmit: "Cancelar la solicitud",
      cancelPending: "Cancelando…",
      rejectTitle: "Rechazar",
      rejectHint: "Hay que explicar por qué. El restaurante lee este motivo.",
      rejectLabel: "Motivo",
      rejectSubmit: "Rechazar la solicitud",
      rejectPending: "Rechazando…",
      waitingClient: "Esperando al restaurante",
      waitingClientReason:
        "Ya está validada y enviada. El siguiente paso es suyo: aceptar o rechazar el alcance.",
      jobLink: "Ver el trabajo",

      // §84 · el presupuesto de la solicitud (Hito 12).
      quoteTitle: "Presupuesto",
      quoteNone:
        "Sin presupuesto. Si el plan no incluye este cambio, o se cobra aparte, se presupuesta desde aquí.",
      quoteCreateLink: "Presupuestar esta solicitud",
      quoteOpenLink: "Ver el presupuesto",
      quoteLine: (code: string, total: string) => `${code} · ${total}`,
      quoteWaitingHint:
        "Mientras haya un presupuesto abierto, la aceptación es la del presupuesto: el restaurante no puede aceptar el alcance por fuera.",

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
      priorityColumn: "Orden de importancia",
      priorityShort: (rank: number) => `Nº ${rank}`,
      priorityShortNone: "—",
      orderHint:
        "Primero lo que cada restaurante ha marcado como más importante; después, lo más reciente.",
      unassigned: "Sin asignar",
      openLink: "Abrir",

      // M09 · la misma bandeja vista por estado. No hay dato nuevo: son los
      // mismos trabajos, agrupados por la columna "Estado" de la tabla.
      viewLabel: "Cómo verlo",
      viewList: "Lista",
      viewBoard: "Tablero",
      boardHint:
        "Los mismos trabajos, agrupados por su estado. Las columnas van en el orden en que un trabajo recorre su vida.",
      boardColumnCount: (total: number) =>
        total === 1 ? "1 trabajo" : `${total} trabajos`,
      boardColumnEmpty: "Ninguno en este estado.",
      boardUnknownTitle: "Estado no reconocido",
      boardUnknownHint:
        "Estos trabajos tienen un estado que no está en los once del PRD. Se enseñan aquí para no hacerlos desaparecer de la bandeja.",
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
      // RN-JOB-06 / §84 · la puerta de un trabajo presupuestado (Hito 12).
      quoteGateTitle: "Trabajo presupuestado aparte",
      quoteGateCode: (code: string) => `Presupuesto ${code}. No consume la bolsa del plan (RN-CON-03).`,
      quoteGatePaid: "Cobrado: se puede comenzar.",
      quoteGateAuthorized: "Pago pendiente, pero el inicio está autorizado y registrado: se puede comenzar.",
      quoteGateNoPaymentRequired: "No exige pago previo: se puede comenzar.",
      quoteGateBlocked:
        "Pago pendiente y pago previo exigido: Comenzar espera al cobro o a que el propietario o un administrador autorice el inicio desde el presupuesto.",
      quoteGateLink: "Abrir el presupuesto",
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
      priorityLabel: "Orden de importancia del restaurante",
      priorityValue: (rank: number) => `Nº ${rank} de sus cambios pendientes`,
      priorityHint: "Lo ha ordenado así el propio restaurante, incluido en su plan.",
      priorityNone: "Sin ordenar",
      priorityNoneHint:
        "Ordenar los cambios por importancia va incluido en el plan Premium+. Este restaurante no lo ha hecho, o su plan no lo incluye.",

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
    // §38, RN-CAN · los canales internos del espacio (M76).
    channels: {
      title: "Canales internos",
      subtitle:
        "Conversaciones del equipo que no cuelgan de ningún restaurante. Entra quien esté en la lista de miembros del canal, y nadie más.",
      spaceChannel: "Canal del equipo",
      notice:
        "Esto es un canal interno del equipo. El restaurante no lo ve ni lo verá nunca.",
      untitled: "Canal sin nombre",
      unknownPerson: "Cuenta sin nombre",
      archived: "Archivado",
      memberCount: (n: number) => (n === 1 ? "1 miembro" : `${n} miembros`),
      lastMessage: (fecha: string) => `Último mensaje el ${fecha}`,
      noMessages: "Todavía no se ha escrito nada aquí.",
      open: "Abrir el canal",
      unread: (n: number) => (n === 1 ? "1 sin leer" : `${n} sin leer`),
      notMember:
        "No eres miembro de este canal, así que no puedes leer lo que se dice dentro. Ver que existe y entrar en él son dos cosas distintas.",
      membersTitle: "Quién está dentro",
      membersEmpty:
        "Este canal no tiene miembros, así que no lo lee nadie. Añade a alguien para que sirva de algo.",
      noCandidates: "Ya está todo el equipo dentro de este canal.",
      addLabel: "Añadir a alguien del equipo",
      addChoose: "Elige a quién",
      add: "Añadir al canal",
      remove: "Sacar",
      memberRequired: "Elige a quién quieres añadir.",
      archive: "Archivar el canal",
      unarchive: "Desarchivar",
      createTitle: "Crear un canal",
      createHint:
        "General, Proyectos web, Menú diario, Redes sociales, Diseño y creatividad y Soporte interno vienen de fábrica. Crea los que necesites: nadie entra en uno sin que lo añadas.",
      nameLabel: "Nombre del canal",
      nameRequired: "Ponle un nombre al canal.",
      createSubmit: "Crear el canal",
      pending: "Guardando…",
      done: "Hecho.",
      emptyTitle: "No ves ningún canal",
      emptyReason:
        "O este espacio no tiene canales todavía, o no eres miembro de ninguno. Quien administra el espacio puede añadirte.",
    },

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
      // §84 · desde el Hito 12, los presupuestos viven en Finanzas.
      quotesLink: "Presupuestos",
      quotesHint: "Lo que se cobra aparte del plan: trabajos fuera de bolsa y plantillas de Menú Diario.",
      registerTitle: "Registrar un pago",
      registerAmountLabel: "Importe cobrado",
      registerDateLabel: "Fecha del cobro",
      registerReceiptLabel: "Justificante (opcional)",
      receiptColumn: "Justificante",
      receiptNone: "Sin justificante",

      // M51 · el historial de cobros parciales. Los pagos parciales ya
      // funcionaban; lo que faltaba era poder leerlos uno a uno.
      paymentsTitle: "Pagos registrados",
      paymentsEmptyReason: "Todavía no se ha registrado ningún pago de este cobro.",
      paymentLine: (importe: string, metodo: string, fecha: string) =>
        `${importe} · ${metodo} · ${fecha}`,
      paymentReversed: (fecha: string) => `Revertido el ${fecha}`,
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
        "Ordenar los cambios por importancia va incluido en el plan Premium+. Con tu plan actual el equipo los atiende por orden de llegada.",
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
    // Vista 22 · "Informes y datos" del panel del restaurante.
    dataCardTitle: "Informes y datos",
    dataCardHint: "Consulta los datos de tu restaurante cuando las fuentes estén disponibles.",
    dataLink: "Ver informes y datos",
    // Vista 25.03 · "Autorizar fuentes y exportar". La exportación es de
    // la Fase 4, así que aquí solo se autoriza.
    sourcesTitle: "Autorizar fuentes",
    sourcesHint:
      "Conecta tus cuentas para que el equipo de mantenimiento pueda leer los datos de tu web. Usamos tu propia cuenta mediante OAuth; Cuotly no guarda tu contraseña.",
    sourcesConnectedTitle: "Cuentas conectadas",
    sourcesLink: "Autorizar fuentes",
    sourcesExportNote:
      "Exportar tus datos («Descargar mis datos») es de la Fase 4 y todavía no existe.",
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
    // RN-REQ-05 · la prioridad de la solicitud (página 63 del diseño
    // definitivo móvil). NO es el "Orden de importancia" (RN-PRI), que es
    // otra cosa y tiene su propia pantalla: aquí se dice cuánto corre
    // ESTA, y allí cuál va antes que cuál.
    newPriorityLabel: "Prioridad",
    newPriorityHelp: "Cuánto te corre este cambio.",
    priorityLevels: {
      high: "Alta",
      medium: "Media",
      low: "Baja",
    },
    newPriorityReasonLabel: "Motivo de la prioridad",
    newPriorityReasonHelp: "Por qué te corre. Máximo 200 caracteres.",
    newPriorityReasonPlaceholder: "Es importante publicarlo antes del 1 de octubre.",
    // RN-REQ-06 · lo que la prioridad NO es. Sin esta línea, marcar "Alta"
    // se lee como que el trabajo se adelanta, y eso no lo decide el
    // cliente.
    newPriorityNotAPromise:
      "Nos dice cuánto te corre a ti. No cambia los plazos de tu plan ni adelanta el trabajo: sirve para que el equipo sepa por dónde empezar.",
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
    // R24 · RN-EST-09, el restaurante comunica la baja del servicio.
    termination: {
      title: "Darse de baja del servicio",
      hint: "Comunicar la baja NO corta el servicio hoy: el restaurante pasa a Finalizando, que quiere decir que no se renueva. Hasta cuándo tienes servicio lo marcan el periodo que ya has pagado y la permanencia que tengas en vigor.",
      reasonLabel: "Motivo",
      reasonRequired: "Cuéntanos el motivo antes de comunicar la baja.",
      submit: "Comunicar la baja",
      pending: "Comunicando…",
      done: "Baja comunicada. El equipo la ve y te dirá hasta cuándo tienes servicio.",
      already: "Ya has comunicado la baja: este restaurante está en Finalizando y no se renueva.",
      noService: "Este restaurante ya no tiene servicio activo, así que no hay baja que comunicar.",
      onlyOwner:
        "La baja la comunica quien puede escribir en este restaurante. Si crees que deberías poder, pídeselo a su propietario.",
    },

    // R12, A14 · cancelar la solicitud mientras no sea un trabajo.
    cancelTitle: "Cancelar esta solicitud",
    cancelHint:
      "Mientras el equipo no haya empezado a trabajar en ella, puedes cancelarla. No gasta nada de tu plan.",
    cancelLabel: "Motivo (opcional)",
    cancelSubmit: "Cancelar la solicitud",
    cancelPending: "Cancelando…",
    cancelAlready: "Esta solicitud ya está cancelada.",
    cancelFinished:
      "Esta solicitud ya terminó, así que no hay nada que cancelar. Si hay algo que corregir, dilo por la conversación.",
    cancelHasJob:
      "El equipo ya está trabajando en ella. Cancelarla ahora devuelve lo que se haya consumido de tu plan, y eso lo registra el equipo: pídelo por la conversación y te dirán cómo queda.",
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
    // R07 · RN-REQ-04, copiar y pegar dentro del mismo grupo.
    draftCopyTitle: "Copiar este borrador a otro restaurante",
    draftCopyHint:
      "Se crea un borrador nuevo en el restaurante que elijas, con el mismo texto y los mismos archivos. No se envía: nace como borrador para que lo revises allí. Solo se puede dentro del mismo grupo.",
    draftCopyLabel: "¿A cuál?",
    draftCopyChoose: "Elige un restaurante",
    draftCopySubmit: "Copiar el borrador",
    draftCopyPending: "Copiando…",
    draftCopyNoSiblings:
      "Este restaurante no comparte grupo con ningún otro al que puedas escribir, así que no hay a dónde copiarlo.",
    draftCopyFailed: "No se ha podido copiar el borrador. Vuelve a intentarlo.",
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
    securityLink: "Verificación en dos pasos",
  },

  calendar: {
    title: "Calendario",
    emptyTitle: "Nada en este periodo",
    emptyReason:
      "No hay festivos, ausencias, publicaciones, renovaciones ni vencimientos entre estas dos fechas con estos filtros.",
    kinds: {
      holiday: "Festivo",
      absence: "Ausencia",
      correction_window: "Fin de la ventana de corrección",
      charge_due: "Vencimiento de cobro",
      // §76, desde el Hito 12.
      menu_publication: "Publicación de Menú Diario",
      renewal: "Renovación",
      supervision_end: "Fin de sustitución",
    },
    // §75 · los tres filtros que el servidor resuelve. Los demás (grupo,
    // estado) salen de los mismos datos en la pantalla.
    filtersTitle: "Filtrar",
    filterEstablishment: "Restaurante",
    filterWorker: "Trabajador",
    filterKind: "Tipo de evento",
    filterAny: "Todos",
    filterApply: "Aplicar",
    filterClear: "Quitar filtros",
    renewalKinds: {
      plan: "Plan",
      service: "Servicio",
    },
    supervisionKinds: {
      substitute: "Sustitución",
    },
    // §76 · lo que este calendario no enseña, dicho en vez de callado.
    limitsNote:
      "Los límites de comenzar y de ejecución de cada trabajo se ven en su ficha: se calculan con el reloj laboral y no como fechas de calendario.",
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
    // RN-COM-08 · desde el Hito 12 el precio lo decide el servidor
    // (decisión 20): aquí solo se dice cuál se aplica.
    serviceBillingTitle: "Lo que se cobra por cada servicio",
    serviceBillingHint:
      "RN-COM-08: el servicio tiene dos precios y se aplica el segundo cuando el plan activo concede prioridad (Premium+). Cambiar de plan cambia la siguiente mensualidad, nunca las ya emitidas.",
    servicePriceApplied: (precio: string) => `${precio} + IVA / mes`,
    servicePricePremiumReason: "Precio con plan Premium+ activo",
    servicePriceStandardReason: "Precio sin plan Premium+",
    servicePriceUnknown: "No se ha podido leer el precio aplicado.",
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

    // Página 109 del diseño definitivo móvil · las ocho pestañas de
    // Ajustes. Las dos que ya eran páginas propias —Suscripción y
    // Auditoría— conservan su dirección: hay avisos emitidos que apuntan
    // ahí (RN-NOT-04).
    tabs: {
      general: "General",
      schedule: "Horarios",
      taxes: "Impuestos",
      integrations: "Integraciones",
      subscription: "Suscripción",
      security: "Seguridad",
      audit: "Auditoría",
      notifications: "Notificaciones",
    },
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
    logoHint:
      "JPG, PNG o WebP, hasta 2 MB. El resto de la identidad visual no se personaliza.",
    logoPresent: "Hay un logotipo guardado; si subes otro, lo sustituye.",
    logoAbsent: "Todavía no hay logotipo.",
    logoSubmit: "Guardar el logotipo",
    logoPendingLabel: "Subiendo…",
    logoDone: "Logotipo guardado.",
    logoMissing: "Elige un archivo de imagen.",
    logoWrongType: "El logotipo tiene que ser una imagen JPG, PNG o WebP.",
    logoTooBig: "El logotipo no puede pasar de 2 MB.",
    logoUploadFailed:
      "No se ha podido guardar la imagen. No se ha cambiado nada: vuelve a intentarlo.",

    legalNameLabel: "Razón social",
    taxIdLabel: "Identificador fiscal",
    addressLabel: "Dirección fiscal",
    detailsHint:
      "Se copiaron de la solicitud con la que pediste el espacio. No se validan: se guardan tal como los escribas.",
    detailsSubmit: "Guardar los datos",
    detailsPending: "Guardando…",
    detailsDone: "Datos del espacio guardados.",
    detailsUnchanged: "No había nada que cambiar: no se ha registrado ningún cambio.",

    spaceSectionsTitle: "El espacio, de principio a fin",
    ownershipLink: "Propiedad y fin del espacio",
    ownershipHint:
      "Transferir la propiedad a otra persona del equipo, archivar el espacio y recuperarlo.",
    exportLink: "Exportación y conservación",
    exportHint: "Llevarte los datos del espacio en un archivo.",
    onboardingLink: "Puesta en marcha",
    onboardingHint: "Los diez pasos para dejar el espacio listo.",

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

    // M58 · el IVA por defecto del espacio (migración 99).
    taxRateLabel: "IVA por defecto (%)",
    taxRateHint:
      "Es el tipo con el que se emiten las mensualidades y los cobros nuevos. Los cobros ya emitidos NO cambian: cada uno se queda con el tipo que tenía el día que se emitió.",
    taxRateSubmit: "Guardar el IVA",
    taxRatePending: "Guardando…",
    taxRateDone: "IVA guardado. Afecta a los cobros que se emitan a partir de ahora.",
    taxRateInvalid: "Escribe un porcentaje entre 0 y 100.",
    // La moneda y los métodos de pago no son una preferencia del espacio:
    // se dicen, no se eligen (ver `docs/diseno/LAS-CATORCE-PIEZAS.md`).
    currencyLabel: "Moneda",
    currencyValue: "Euro (€)",
    currencyReason: "Cuotly trabaja en euros. No hay otra moneda que elegir.",
    paymentMethodsLabel: "Métodos de pago que se pueden registrar",
    paymentMethodsValue: "Transferencia y Bizum",
    paymentMethodsReason:
      "Los pagos se registran a mano: no hay pasarela. Esto no es una preferencia del espacio, es lo que Cuotly acepta.",
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
      menu_template: "Plantillas de Menú Diario",
      menu: "Menú Diario",
      plan: "Condiciones de planes",
      service: "Condiciones de servicios",
      request: "Solicitudes",
      job: "Trabajos",
      task: "Tareas",
      file: "Archivos",
      absence: "Ausencias",
      correction: "Correcciones",
      session: "Sesiones",
      quote: "Presupuestos",
      integration: "Integraciones",
      support: "Modo soporte",
      platform: "Plataforma",
    },

    auditEntities: {
      space: "Espacio",
      space_request: "Solicitud de espacio",
      access_request: "Solicitud de acceso",
      // RN-ACC-13 (migración 114) · la invitación al panel de un
      // restaurante, que es la tercera puerta de alta.
      establishment_invitation: "Invitación al panel",
      export: "Exportación",
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
      menu: "Menú",
      menu_template: "Plantilla de Menú Diario",
      plan: "Plan",
      service: "Servicio",
      session: "Sesión",
      space_invitation: "Invitación",
      space_membership: "Pertenencia al equipo",
      quote: "Presupuesto",
      integration: "Integración",
      opportunity: "Oportunidad",
      report: "Informe",
      cuotly_charge: "Cobro de Cuotly",
      cuotly_payment: "Pago a Cuotly",
      support_session: "Sesión de Modo soporte",
      platform_role: "Administrador de Cuotly",
      incident: "Incidencia a Cuotly",
      platform_holiday: "Festivo de Cuotly",
      platform_status_event: "Evento de estado de Cuotly",
      // Hito 22 · el teléfono con push de una persona (RN-MOV-05).
      push_device: "Teléfono con avisos",
      // Migración 100 (§38, RN-CAN) · un canal interno es una conversación.
      conversation: "Canal interno",
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
      // RN-ACC-13 (migración 114) · las cuatro de la invitación al panel.
      "panel_invitation.created": "Invitación al panel enviada",
      "panel_invitation.reviewed": "Invitación al panel revisada",
      "panel_invitation.cancelled": "Invitación al panel cancelada",
      "panel_invitation.accepted": "Invitación al panel aceptada",
      "correction.requested": "Corrección pedida",
      "correction.started": "Corrección comenzada",
      "correction.team_error_opened": "Corrección por error del equipo",
      "establishment.created": "Restaurante dado de alta",
      "establishment.data_changed": "Datos del restaurante editados",
      "establishment.status_changed": "Estado del restaurante cambiado",
      // §38, RN-TRA · la transferencia entre espacios. Los dos espacios ven
      // el mismo apunte desde su lado, así que el texto no dice "nuestro"
      // ni "suyo": dice qué pasó.
      "establishment_transfer.proposed": "Transferencia del restaurante propuesta",
      "establishment_transfer.accepted": "Transferencia del restaurante aceptada",
      "establishment_transfer.rejected": "Transferencia del restaurante rechazada",
      "establishment_transfer.withdrawn": "Transferencia del restaurante retirada",
      // §38, RN-CAN · los canales internos del espacio.
      "channel.created": "Canal creado",
      "channel.archived": "Canal archivado",
      "channel.unarchived": "Canal desarchivado",
      "channel.member_added": "Alguien entró en un canal",
      "channel.member_removed": "Alguien salió de un canal",
      "establishment_access.granted": "Acceso a un restaurante concedido",
      "establishment_access.revoked": "Acceso a un restaurante revocado",
      "establishment_permissions.set": "Permisos de un acceso cambiados",
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
      "integration.check_requested": "Comprobación de una integración pedida",
      "integration.checked": "Integración comprobada",
      "integration.connected": "Integración conectada",
      "integration.connection_cancelled": "Conexión de una integración cancelada",
      "integration.connection_started": "Conexión de una integración iniciada",
      "integration.credential_replaced": "Credencial de una integración sustituida",
      "integration.disconnected": "Integración desconectada",
      "integration.reauthorization_required": "Integración pendiente de volver a autorizar",
      "integration.sync_failed": "Sincronización de una integración fallida",
      "integration.revocation_done": "Autorización revocada en Google",
      "integration.revocation_failed": "Revocación en Google fallida",
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
      "membership.approve_reports_changed": "Permiso de aprobar informes cambiado",
      "membership.perform_jobs_changed": "Permiso de ejecutar trabajos cambiado",
      "menu.assigned": "Menú asignado",
      "menu.cancelled": "Menú cancelado",
      "menu.copied": "Menú copiado",
      "menu.correction_completed": "Corrección del menú aplicada",
      "menu.correction_requested": "Corrección del menú pedida",
      "menu.created": "Menú creado",
      "menu.details_updated": "Datos del menú cambiados",
      "menu.downloaded": "Menú descargado",
      "menu.information_provided": "Información del menú aportada",
      "menu.information_requested": "Información del menú pedida",
      "menu.prepared": "Menú preparado",
      "menu.publication_error": "Error al publicar el menú",
      "menu.publication_requested": "Publicación del menú pedida",
      "menu.published": "Menú publicado",
      "menu.ready_to_publish": "Menú listo para publicar",
      "menu.reassigned": "Menú reasignado",
      "menu.team_error_correction_opened": "Corrección del menú por error del equipo",
      "menu.update_refunded": "Actualización devuelta",
      "menu.version_saved": "Versión del menú guardada",
      "menu_template.archived": "Plantilla archivada",
      "menu_template.created": "Plantilla creada",
      "menu_template.design_updated": "Diseño de la plantilla cambiado",
      "opportunity.added_manually": "Oportunidad añadida a mano",
      "opportunity.client_action": "El restaurante actuó sobre una oportunidad",
      "opportunity.detected": "Oportunidad detectada",
      "opportunity.note_added": "Nota añadida a una oportunidad",
      "opportunity.proposal_edited": "Propuesta de una oportunidad editada",
      "opportunity.reopened": "Oportunidad descartada que vuelve a cumplirse",
      "opportunity.status_changed": "Estado de una oportunidad cambiado",
      "payment.registered": "Pago registrado",
      "payment.reversed": "Pago revertido",
      "request.accepted": "Solicitud aceptada",
      "request.accepted_again": "Solicitud aceptada de nuevo",
      "request.cancelled": "Solicitud cancelada",
      "request.classification_validated": "Clasificación validada",
      "request.classified": "Solicitud clasificada",
      "request.converted_from_conversation": "Solicitud creada desde una conversación",
      "request.copied": "Solicitud copiada",
      "request.created_from_quote": "Solicitud creada desde un presupuesto",
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
      // Hito 22 · el teléfono con push (RN-MOV-05).
      "push_device.registered": "Teléfono registrado para avisos",
      "push_device.revoked": "Teléfono dado de baja de los avisos",
      "space.created": "Espacio creado",
      // Hito 18 · el modo del espacio respecto a Cuotly, y su plan.
      "space.activated": "Suscripción de Cuotly activada",
      "space.archived_trial_ended": "Espacio archivado: la prueba terminó sin pago",
      "space.archived_nonpayment": "Espacio archivado por impago",
      "space.reactivated": "Espacio reactivado",
      "space.plan_changed": "Plan de Cuotly cambiado",
      "space.tax_rate_changed": "Cambió el IVA por defecto del espacio",
      "establishment.termination_requested": "El restaurante comunicó la baja del servicio",
      "space.plan_change_scheduled": "Cambio de plan de Cuotly programado",
      "space.plan_change_cancelled": "Cambio de plan de Cuotly anulado",
      "space.extras_changed": "Adicionales de Cuotly cambiados",
      "cuotly_charge.issued": "Cobro de Cuotly emitido",
      "cuotly_payment.declared": "Pago a Cuotly declarado",
      "cuotly_payment.confirmed": "Pago a Cuotly confirmado",
      "cuotly_payment.rejected": "Pago a Cuotly rechazado",
      "cuotly_payment.reversed": "Pago a Cuotly revertido",
      // Hito 17 · el recorrido de una solicitud de creación de espacio.
      // "Enviada" la escribe quien la pide; las otras cuatro, Cuotly.
      "space_request.submitted": "Solicitud de espacio enviada",
      "space_request.in_review": "Solicitud de espacio en revisión",
      "space_request.needs_information": "Se pidió más información sobre la solicitud",
      "space_request.approved": "Solicitud de espacio aprobada",
      "space_request.rejected": "Solicitud de espacio rechazada",
      "access_request.submitted": "Solicitud de acceso enviada",
      "access_request.replied": "Respuesta a la solicitud de acceso",
      "access_request.needs_information": "Se pidió más información sobre la solicitud de acceso",
      "access_request.approved": "Solicitud de acceso aprobada",
      "access_request.rejected": "Solicitud de acceso no aprobada",
      "access_request.account_created": "Cuenta creada desde una solicitud de acceso",
      "space.payment_term_changed": "Plazo de pago cambiado",
      "space.renamed": "Espacio renombrado",
      "space.details_changed": "Datos del espacio cambiados",
      "space.logo_changed": "Logotipo del espacio cambiado",
      "space.onboarding_completed": "Puesta en marcha completada",
      "space.ownership_transferred": "Propiedad del espacio transferida",
      "space.archived_by_owner": "Espacio archivado por su propietario",
      "space.restored_by_owner": "Espacio restaurado",
      "export.requested": "Exportación de datos",
      "incident.opened": "Incidencia abierta a Cuotly",
      "incident.status_changed": "Incidencia: cambio de estado",
      "incident.replied": "Incidencia: mensaje",
      "incident.attachment_added": "Incidencia: adjunto añadido",
      "platform_holiday.added": "Festivo de Cuotly añadido",
      "platform_holiday.retired": "Festivo de Cuotly retirado",
      "platform_status.declared": "Estado de Cuotly: evento declarado",
      "platform_status.resolved": "Estado de Cuotly: evento resuelto",
      "space.timezone_changed": "Zona horaria cambiada",
      "subscription.plan_change_cancelled": "Cambio de plan anulado",
      "subscription.plan_change_scheduled": "Cambio de plan programado",
      "subscription.plan_changed": "Plan cambiado",
      "subscription.plan_created": "Plan dado de alta",
      "subscription.service_created": "Servicio contratado",
      "subscription.terms_accepted": "Condiciones aceptadas por el restaurante",
      "subscription.terms_recorded": "Aceptación externa de condiciones registrada",
      "plan.conditions_published": "Condiciones del plan publicadas",
      "quote.created": "Presupuesto creado",
      "quote.updated": "Presupuesto corregido",
      "quote.sent": "Presupuesto enviado al restaurante",
      "quote.accepted": "Presupuesto aceptado",
      "quote.rejected": "Presupuesto rechazado",
      // Fase 3, Hito 16 · informes (§89 a §95).
      "report.created": "Informe preparado",
      "report.renamed": "Informe renombrado",
      "report.scheduled": "Envío de informe programado",
      "report.sections_changed": "Secciones del informe cambiadas",
      "report.send_blocked": "Envío detenido: hay oportunidades pendientes",
      "report.sent": "Informe enviado",
      "report.status_changed": "Estado del informe cambiado",
      "report.version_generated": "Cifras del informe generadas",
      "quote.start_authorized": "Inicio autorizado antes del pago",
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
      "platform.admin_granted": "Administrador de Cuotly nombrado",
      "platform.admin_updated": "Permisos de un Administrador de Cuotly cambiados",
      "platform.admin_revoked": "Administrador de Cuotly retirado",
      "support.session_started": "Cuotly ha entrado en Modo soporte",
      "support.session_ended": "Cuotly ha salido de Modo soporte",
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
  /**
   * Fase 3 · Hito 16 · informes (§89 a §95, RN-REP). Todo el texto que ve
   * una persona sale de aquí, incluido el del PDF: la base guarda cifras y
   * claves, nunca frases (CLAUDE.md).
   */
  reportsPage: {
    title: "Biblioteca de informes",
    subtitle: "Consulta, filtra y gestiona todos los informes de tus restaurantes.",
    empty: "Todavía no hay informes",
    emptyReason:
      "Ninguno se ha preparado con estos filtros. Un informe se prepara desde aquí: se eligen la familia, el restaurante y el periodo, y Cuotly genera las cifras.",
    create: "Preparar informe",
    detail: "Revisar y programar",

    // §89 · las tres familias.
    categories: {
      operation: "Operación",
      finance: "Finanzas",
      digital: "Rendimiento digital",
    },
    categoryHints: {
      operation: "Solicitudes, trabajos, tareas, tiempos, consumos y menús.",
      finance: "Ingresos, cobros, impagos y renovaciones.",
      digital: "Web, Google y fuentes conectadas.",
    },

    // §95 · los seis estados.
    states: {
      preparing: "Preparando",
      pending_review: "Pendiente de revisión",
      approved: "Aprobado",
      scheduled: "Programado",
      sent: "Enviado",
      archived: "Archivado",
    },
    stateHints: {
      preparing: "Revisa las secciones y aprueba para programar el envío.",
      pending_review: "Requiere aprobación para finalizar y programar el envío.",
      approved: "Aprobado. Se puede programar o enviar.",
      scheduled: "Programado. Cuotly avisa 24 horas antes de la fecha.",
      sent: "Enviado al restaurante. Lo enviado no se edita: una corrección es una versión nueva.",
      archived: "Archivado. Se conserva y deja de aparecer en la lista activa.",
    },

    // §95 · las cinco secciones de la maqueta 10.04, más Finanzas (§89).
    sections: {
      executive_summary: "Resumen ejecutivo",
      month_activity: "Lo que ha pasado este mes",
      operation: "Operación",
      finance: "Finanzas",
      digital: "Rendimiento digital",
      opportunities: "Oportunidades",
      annexes: "Anexos y evidencias",
    },
    // Lo que la maqueta escribe en pequeño junto a cada casilla.
    sectionHints: {
      executive_summary: "Lo escribe una persona. Cuotly no lo redacta.",
      month_activity: "El relato del periodo, día a día. Cuotly lo ordena: no lo escribe.",
      operation: "Solicitudes, trabajos, plazos, bloqueos, consumos y menús.",
      finance: "Ingresos, cobros, impagos y renovaciones.",
      digital: "Web, Google y fuentes conectadas, con la fecha de cada dato.",
      opportunities: "Solo las aprobadas. Las pendientes impiden el envío.",
      annexes: "Evidencias y detalle de apoyo.",
    },
    // RN-REP-18 · el relato del mes. Cada clase de entrada dice QUÉ pasó,
    // nunca quién lo hizo (P7): "Cambio entregado", no "entregado por
    // Marta". El sujeto que va detrás es texto del propio restaurante —el
    // código de su cambio, el nombre de su archivo, el día de su menú—.
    activity: {
      title: "Lo que ha pasado este mes",
      empty: "En este periodo no se registró ninguna actividad.",
      changesTitle: "Tus cambios",
      othersTitle: "Además",
      kinds: {
        correction_requested: "Corrección solicitada",
        menu_published: "Menú del día publicado",
        file_shared: "Archivo compartido",
        charge_issued: "Cobro emitido",
        payment_recorded: "Pago registrado",
      },
    },

    // RN-REP-18 (decisión 58) · la ficha de cada cambio. Donde iría la
    // fecha de fin, si no la hay, va lo que pasa de verdad — nunca un
    // hueco ni una fecha inventada (CLAUDE.md).
    //
    // Se llama `changeCard` y no `change` porque `change` ya es la
    // variación respecto al periodo anterior (RN-REP-17): dos cosas
    // distintas que en español se dicen igual.
    changeCard: {
      startedOn: (fecha: string) => `Empezado el ${fecha}`,
      deliveredOn: (fecha: string) => `Entregado el ${fecha}`,
      requestedOn: (fecha: string) => `Pedido el ${fecha}`,
      inProgress: "En proceso",
      pendingStart: "Pendiente de empezar",
      underReview: "En análisis",
      rejectedOn: (fecha: string) => `Rechazado el ${fecha}`,
      cancelledOn: (fecha: string) => `Cancelado el ${fecha}`,
      budgeted: "Presupuestado aparte",
      // Sin clasificar todavía: no se le adivina una categoría, porque eso
      // sería decirle al restaurante qué va a gastar antes de saberlo.
      unclassified: "Sin clasificar todavía",
      corrections: (n: number) =>
        n === 1 ? "1 corrección pedida" : `${n} correcciones pedidas`,
    },

    // RN-REP-20 · la bolsa del mes. "1 de 0 · 1 presupuestado aparte" no
    // es un error de cuentas: un cambio presupuestado NO consume bolsa
    // (RN-CON-03), así que los dos números salen de sitios distintos.
    allowance: {
      title: "Tus cambios de este mes",
      // "3 de 6 incluidos" para las fotografías es incorrecto, y "1 de 1
      // incluidos" también: el adjetivo concuerda con la categoría en
      // género y con el número en singular o plural. Son cuatro formas y
      // se escriben las cuatro, porque esto lo lee un cliente.
      line: (consumidos: number, incluidos: number, femenino: boolean) =>
        `${consumidos} de ${incluidos} ` +
        (incluidos === 1 ? (femenino ? "incluida" : "incluido") : femenino ? "incluidas" : "incluidos"),
      noPlan: (consumidos: number) => `${consumidos} consumidos · sin plan de mantenimiento`,
      budgeted: (n: number) =>
        n === 1 ? "1 presupuestado aparte" : `${n} presupuestados aparte`,
    },
    judgementBadge: "Requiere criterio",
    judgementHint:
      "Esta sección la escribe o la elige una persona. Cuotly no la redacta: no hay ninguna regla que genere ese texto.",
    objectiveOnly:
      "Solo lleva secciones objetivas, así que puede programarse sin aprobación (§95).",
    needsApproval:
      "Lleva una sección que requiere criterio, así que hay que aprobarlo antes de programar el envío.",

    // Los nombres de cada cifra. Son claves en la base y frases aquí.
    metrics: {
      requests_received: "Solicitudes recibidas",
      requests_accepted: "Solicitudes aceptadas",
      requests_rejected: "Solicitudes rechazadas",
      requests_cancelled: "Solicitudes canceladas",
      jobs_started: "Trabajos iniciados",
      jobs_completed: "Trabajos completados",
      jobs_pending: "Trabajos pendientes",
      start_compliance: "Cumplimiento de inicio",
      execution_compliance: "Cumplimiento de ejecución",
      average_start: "Tiempo medio de inicio",
      average_completion: "Tiempo medio de finalización",
      jobs_blocked: "Trabajos bloqueados",
      blocked_time: "Duración bloqueada",
      corrections_requested: "Correcciones solicitadas",
      consumption: "Consumo",
      menu_updates_used: "Actualizaciones de Menú Diario",
      menus_published: "Menús publicados",
      menus_out_of_guarantee: "Menús fuera de garantía",
      income_base: "Ingresos (base)",
      income_total: "Ingresos (con IVA)",
      charges_issued: "Cobros emitidos",
      collected: "Cobrado",
      outstanding: "Pendiente de cobro",
      charges_overdue: "Cobros vencidos",
      establishments_with_debt: "Restaurantes con deuda",
      renewals_due: "Renovaciones del periodo",
      users: "Usuarios",
      sessions: "Sesiones",
      clicks: "Clics desde Google",
      impressions: "Impresiones",
      position: "Posición media",
      profile_impressions: "Impresiones de la ficha",
      website_clicks: "Clics a la web",
      call_clicks: "Llamadas",
      direction_requests: "Cómo llegar",
      dead_clicks: "Clics muertos",
      rage_clicks: "Clics de rabia",
      performance_score_by_strategy: "Puntuación de rendimiento",
    },

    // Filtros de §93.
    filters: {
      title: "Filtros",
      establishment: "Restaurante",
      allEstablishments: "Todos los restaurantes",
      group: "Grupo",
      allGroups: "Todos",
      plan: "Plan",
      allPlans: "Todos",
      worker: "Trabajador",
      allWorkers: "Todos",
      category: "Categoría",
      allCategories: "Todas",
      state: "Estado",
      allStates: "Todos",
      service: "Servicio",
      allServices: "Todos",
      period: "Periodo",
      from: "Desde",
      to: "Hasta",
      apply: "Aplicar",
    },

    // Columnas de la vista 10.01.
    columns: {
      name: "Nombre del informe",
      establishment: "Restaurante",
      category: "Categoría",
      period: "Periodo",
      state: "Estado",
      createdAt: "Fecha de creación",
      sentAt: "Fecha de compartición",
      format: "Formato",
      actions: "Acciones",
      previous: "Frente al periodo anterior",
    },

    // RN-REP-17 · la comparación con el periodo anterior. Dice la
    // DIRECCIÓN, nunca si está bien: que suban las incidencias es malo y
    // que suban las visitas es bueno, y eso lo escribe una persona en el
    // resumen ejecutivo.
    change: {
      noPrevious: "Sin periodo anterior",
      flat: "Igual que el periodo anterior",
      fromZero: "El periodo anterior fue 0",
      // En una tarjeta de portada no caben las frases de arriba, y
      // truncarlas sería peor que decirlas cortas.
      flatShort: "Igual",
      fromZeroShort: "Antes: 0",
      // El signo va con el guion normal (U+002D) y **no** con el menos
      // tipográfico (U+2212): el menos tipográfico no existe en WinAnsi,
      // que es lo que escribe la fuente estándar del PDF, así que allí se
      // caía y "−16 %" salía como "16 %". Una caída pintada como subida
      // es el peor fallo que puede tener una comparación.
      up: (percent: number) => `+${percent} %`,
      down: (percent: number) => `-${percent} %`,
      versus: (periodo: string) => `frente a ${periodo}`,
      // RN-REP-23 (decisión 60) · la otra comparación, la que en
      // hostelería significa algo. Se dice con palabras distintas a
      // propósito: dos porcentajes seguidos sin etiqueta son dos números
      // que el lector no sabe contra qué van.
      yearAgo: "frente al año pasado",
      yearAgoShort: "año pasado",
      noYearAgo: "Sin datos del año pasado",
    },

    // RN-REP-21 (decisión 60) · los tiempos de cada cambio, uno a uno.
    timings: {
      title: "Cuánto tardó cada cambio",
      // Se dice en horas laborables y se dice que lo son: el restaurante
      // no cuenta igual un martes que un domingo, y nosotros tampoco.
      hint: "Horas de trabajo, no de calendario: no cuentan noches, fines de semana ni festivos.",
      columns: {
        change: "Cambio",
        start: "Tardó en empezar",
        delivery: "Tardó en hacerse",
        blocked: "Parado",
        corrections: "Correcciones",
      },
      withinSla: "en plazo",
      outOfSla: "fuera de plazo",
      inAnalysis: "En análisis",
      notStarted: "Pendiente de empezar",
      noValue: "—",
      // "2 h" y "1 d 3 h": un restaurante no lee 4.320 minutos.
      duration: (minutes: number) => {
        const horas = Math.round(minutes / 60);
        if (horas < 24) return `${horas} h`;
        const dias = Math.floor(horas / 24);
        const resto = horas % 24;
        return resto === 0 ? `${dias} d` : `${dias} d ${resto} h`;
      },
      blockedBy: (motivos: string) => `parado por ${motivos}`,
      empty: "Ningún cambio del periodo tiene tiempos todavía.",
    },

    // Los cuatro motivos de bloqueo. Son categorías cerradas y ninguna
    // nombra a nadie del equipo (P7).
    blockReasons: {
      client_information: "falta información del restaurante",
      external_incident: "incidencia externa",
      authorized_pause: "pausa autorizada",
      financial_hold: "retención por pago pendiente",
    },

    // RN-REP-22 (decisión 60) · la evolución dentro del mes.
    evolution: {
      title: "Cómo fue evolucionando el mes",
      hint: "Bloques de 7 días desde el primer día del periodo, para que cada uno tenga el mismo fin de semana.",
      partial: "periodo parcial",
      noData: "sin datos",
      week: (desde: string, hasta: string) => `${desde} – ${hasta}`,
    },

    // RN-REP-25 (decisión 60) · el efecto de cada cambio publicado.
    effect: {
      title: "Qué pasó después de cada cambio",
      // La frase más importante del informe entero: dice lo que pasó y NO
      // dice que lo causara el cambio, porque eso no se sabe.
      hint:
        "Comparamos los 14 días anteriores con los 14 posteriores a publicar cada cambio. " +
        "Es lo que pasó después, no necesariamente lo que el cambio causó.",
      publishedOn: (fecha: string) => `publicado el ${fecha}`,
      // Con flecha NO: `→` no existe en WinAnsi, que es lo que escribe la
      // fuente estándar del PDF, y `sanitize()` la borraba dejando dos
      // números pegados sin decir cuál era cuál. Lo encontró mirar el PDF,
      // no el typecheck. Con palabras se lee igual y no depende de la
      // tabla de caracteres de nadie.
      arrow: (antes: string, despues: string) => `de ${antes} a ${despues}`,
      incompleteWindow: "Aún sin medir: no han pasado los 14 días.",
      noData: "Sin datos suficientes en esos días.",
      overlapping: (codigos: string) =>
        `Atención: en esos mismos días también se publicó ${codigos}.`,
      empty: "No se publicó ningún cambio en el periodo.",
    },

    // RN-REP-26 (decisión 60) · el aprovechamiento del plan.
    planUsage: {
      title: "Cuánto estás aprovechando tu plan",
      hint: "Ciclos ya cerrados de tu permanencia. Lo que no se usa en un mes no pasa al siguiente.",
      line: (usados: number, incluidos: number) => `${usados} de ${incluidos}`,
      unused: (n: number, femenino: boolean) =>
        n === 0
          ? "todos aprovechados"
          : n === 1
            ? femenino
              ? "1 sin usar"
              : "1 sin usar"
            : `${n} sin usar`,
    },

    // RN-REP-24 (decisión 60) · qué pasó con lo que propusimos.
    followUp: {
      title: "Qué pasó con lo que te propusimos",
      states: {
        done: "Hecha",
        in_progress: "En marcha",
        open: "Sigue abierta",
        no_longer: "Ya no aplica",
      },
    },

    // Vista 10.04 · revisar y programar.
    detailTitle: "Revisar y programar informe",
    detailSubtitle: "Revisa el contenido, selecciona las secciones y programa el envío del informe.",
    infoTitle: "Información del informe",
    nameLabel: "Nombre",
    periodLabel: "Periodo",
    sectionsTitle: "Secciones del informe",
    previewTitle: "Vista previa",

    // Decisión 29 · lo que el LECTOR enciende y apaga sobre la versión
    // guardada. No tiene nada que ver con las casillas de arriba: aquellas
    // son del equipo y se guardan; estas no salen de la pantalla.
    viewSectionsTitle: "Qué se ve",
    viewSectionsHint:
      "La versión guarda las cifras de las seis secciones. Enciende o apaga las que quieras mirar; el PDF sale con las que eligió el equipo de mantenimiento.",
    viewSectionExtra: "No va en el PDF",
    stateTitle: "Estado del informe",
    approvalTitle: "Aprobación",
    approve: "Aprobar informe",
    approveHint: "Requiere tu aprobación para finalizar y programar el envío.",
    scheduleTitle: "Programar envío",
    scheduleDate: "Fecha de envío",
    scheduleChannel: "Enviar por email",
    scheduleNoChannel: "No enviar: solo dejarlo disponible",
    includeCsv: "Incluir CSV con los datos",
    schedule: "Programar envío",
    sendNow: "Enviar ahora",
    sendToReview: "Devolver a revisión",
    archive: "Archivar",
    archiveReason: "Motivo",
    regenerate: "Regenerar cifras",
    versionsTitle: "Versiones",
    versionLabel: (n: number) => `Versión ${n}`,
    noVersion: "Todavía no se han generado cifras de este periodo.",
    downloadPdf: "Descargar PDF",
    downloadCsv: "Descargar CSV",
    historicalHint:
      "Si una fuente está desconectada, el informe conserva el histórico con la fecha del último dato disponible: nunca se presenta un dato viejo como actual.",
    blockedByOpportunities: (n: number) =>
      `No se ha enviado: hay ${n} ${n === 1 ? "oportunidad pendiente" : "oportunidades pendientes"} de aprobar de este periodo. El informe ha vuelto a revisión.`,
    pendingOpportunities:
      "Hay oportunidades pendientes de este periodo. Mientras lo estén, el informe no sale.",
    sentTo: (n: number) => `Enviado a ${n} ${n === 1 ? "destinatario" : "destinatarios"}.`,
    noRecipients: "Nadie del restaurante puede ver informes todavía, así que el envío no llegaría a nadie.",
    workerNotAllowed:
      "Los informes de un restaurante son del propietario y de los administradores (§89). Tu informe personal está en tu ficha.",

    // Lo que ve el restaurante (vista 22.01).
    clientTitle: "Informes disponibles",
    clientSubtitle: "Consulta y descarga los informes compartidos por el equipo de mantenimiento.",
    clientEmpty: "Todavía no hay informes compartidos",
    clientEmptyReason:
      "El equipo de mantenimiento comparte aquí los informes cuando los envía. No hay ninguno de este periodo.",

    // §90 · el informe personal del trabajador.
    personalTitle: "Mi informe personal",
    personalSubtitle: "Tu carga, tus trabajos y tu cumplimiento de plazos. No incluye finanzas.",
    personalDeadlines: "Plazos",
    personalMetrics: {
      currentLoadPoints: "Carga actual",
      historicalPoints: "Puntos históricos realizados",
      jobsCompleted: "Trabajos realizados",
      jobsPending: "Pendientes",
      startCompliancePercent: "Cumplimiento de inicio",
      executionCompliancePercent: "Cumplimiento de ejecución",
      averageStartMinutes: "Tiempo medio de inicio",
      averageCompletionMinutes: "Tiempo medio de finalización",
      jobsBlocked: "Bloqueos",
      correctionsRequested: "Correcciones",
    },
    loadIsNotAScore:
      "La carga no es una nota de rendimiento (§55). Los puntos históricos van aparte de la carga actual a propósito.",
    comparisonsOnlyForManagers:
      "Las comparaciones entre trabajadores solo las ven propietario y administradores, y se segmentan por plan, categoría y periodo. No hay ranking.",

    // El PDF (§93). Su texto también es de aquí.
    pdf: {
      brand: "Cuotly",
      brandSuffix: "by Restavor",
      contents: "Contenido",
      generatedAt: (fecha: string) => `Generado el ${fecha}`,
      periodLine: (desde: string, hasta: string) => `Periodo: ${desde} – ${hasta}`,
      establishmentLine: (nombre: string) => `Restaurante: ${nombre}`,
      consolidated: "Consolidado de todos los restaurantes",
      noValue: "Sin dato",
      page: (n: number, total: number) => `Página ${n} de ${total}`,

      // RN-REP-19 · la maqueta que aprobó Bosco el 20/09/2026.
      headline: "Lo esencial",
      headlineHint: "Si solo lees una página, es esta.",
      writtenByAPerson: "Lo escribe una persona del equipo. Cuotly no lo redacta.",
      contentsTitle: "En este informe",
      columnConcept: "CONCEPTO",
      columnValue: "ESTE PERIODO",
      columnPrevious: "VS. PERIODO ANTERIOR",
      barsLegend: "Barra oscura: este periodo. Barra clara: el anterior.",
      opportunityMeta: (impacto: string, esfuerzo: string) => `${impacto} · Esfuerzo: ${esfuerzo}`,
      opportunityEffortUnknown: "sin categoría todavía",
      sourceConnected: "Conectada",
      sourceMissing: "Sin datos",
      sourceUpTo: (fecha: string) => `Datos hasta el ${fecha}`,
      // El pie va en todas las páginas: un PDF se imprime y se reparte
      // suelto, y una hoja sin contexto no se sabe de quién es.
      footer: (restaurante: string, periodo: string) => `${restaurante} · ${periodo}`,
      pageOfShort: (n: number, total: number) => `${n} / ${total}`,
    },

    // Unidades de las cifras, para no escribirlas en cada pantalla.
    units: {
      percent: (valor: number) => `${valor} %`,
      business_minutes: (valor: number) => formatoHorasLaborables(valor),
      minutes: (valor: number) => formatoHoras(valor),
      changes: (valor: number) => `${valor}`,
      updates: (valor: number) => `${valor}`,
      cents: (valor: number) => formatoEuros(valor),
    },
  },

  /**
   * §20.2, la otra mitad de la misma frase. La estructura de Menú Diario
   * sale del alcance de la Fase 2 del ROADMAP y de §6.2; los números que
   * se citan (30 actualizaciones, tres plantillas) son RN-COM-09 y
   * RN-COM-10, no invenciones — y se cuentan en prosa, no como contadores
   * a cero que parecerían un dato real.
   */
  /**
   * Fase 2 · Hito 11 · Menú Diario visto por el equipo: la cola y la ficha
   * (RN-MEN-06/07/09, RN-ASG-02/17, RN-COR-10, P7 al revés: aquí sí se ve
   * quién). Los nombres de estado salen de `naming.states.menu` (CA-21).
   */
  dailyMenuTeam: {
    title: "Menú Diario",
    subtitle: "Las publicaciones que los restaurantes han pedido, por fecha y hora de corte.",
    queueTitle: "Cola de publicaciones",
    queueEmptyTitle: "No hay ninguna publicación pendiente",
    queueEmptyReason:
      "Cuando un restaurante pida la publicación de un menú, o pida una corrección de uno publicado, aparecerá aquí.",
    noServiceTitle: "Este espacio no ofrece Menú Diario",
    noServiceReason: "No hay ningún servicio de tipo Menú Diario en Planes y servicios, así que ningún restaurante puede pedir publicaciones.",
    menuColumn: "Menú",
    establishmentColumn: "Restaurante",
    dateColumn: "Fecha",
    cutoffColumn: "Corte",
    stateColumn: "Estado",
    assigneeColumn: "Asignado a",
    unassigned: "Sin asignar",
    assignedToSomeone: "Asignado",
    guaranteedShort: "Garantizada",
    notGuaranteedShort: "Sin garantía",
    overdueShort: "Pasada de hora",
    correctionsPending: (n: number) => (n === 1 ? "1 corrección pendiente" : `${n} correcciones pendientes`),
    orderHint: "Primero la fecha más próxima; a igual fecha, el corte más cercano.",
    openLink: "Abrir",

    backToQueue: "Volver a la cola",
    detailSubtitle: (establishment: string, kind: string, date: string) => `${establishment} · ${kind} · ${date}`,
    detailTemplate: "Plantilla",
    detailNoTemplate: "Sin plantilla",

    deadlinesTitle: "Plazos",
    cutoffLine: (when: string) => `Corte: ${when}. Hasta entonces el restaurante puede cambiar el contenido.`,
    publishByLine: (when: string) => `Límite de publicación: ${when}.`,
    requestedLine: (when: string) => `Publicación pedida el ${when}.`,
    guaranteed: "Garantizada: la petición y la última versión llegaron antes del corte. Hay que publicar antes de las 08:00.",
    notGuaranteed: "Sin garantía: la petición o alguna versión llegaron después del corte. Se publica cuando se pueda.",
    overdue: "Pasada de hora: estaba garantizada antes de las 08:00 y sigue sin publicar.",
    notRequested: "El restaurante todavía no ha pedido la publicación.",

    publicationTitle: "Publicación",
    assignedTo: (name: string) => `Asignada a ${name}`,
    assignedToSelf: "Asignada a ti",
    assignedMode: { auto: "asignación automática", manual: "asignación manual" },
    noAssignee: "Nadie la ha asumido todavía.",
    publishedBy: (name: string, when: string) => `Publicado por ${name} el ${when}.`,
    publishedAt: (when: string) => `Publicado el ${when}.`,

    contentTitle: (version: number | null) => (version === null ? "Contenido" : `Contenido · versión ${version} (la que se publica)`),
    contentEmpty: "El restaurante no ha guardado contenido todavía.",
    starters: "Primeros",
    mains: "Segundos",
    desserts: "Postres",
    drink: "Bebida",
    price: "Precio",
    note: "Nota",
    // RN-MEN-07: "el trabajador ve los cambios de versión y su hora".
    versionsTitle: "Versiones y sus horas",
    versionLine: (n: number, when: string) => `Versión ${n} · ${when}`,
    versionAfterCutoff: "después del corte",
    versionAfterRequest: "después de pedir la publicación",

    downloadsTitle: "Descargar la plantilla generada",
    downloadsHint:
      "Paso 4 de §61: si eres quien tiene asignada la publicación, descargar pone el menú en «Listo para publicar». Descargar no consume nada.",
    downloadPng: "Descargar PNG",
    downloadPdf: "Descargar PDF",
    downloadsNeedContent: "Para generarla hacen falta contenido guardado y una plantilla.",

    actionsTitle: "Qué puedes hacer",
    assignTitle: "Asignar",
    reassignTitle: "Reasignar",
    assignHint:
      "Candidatos con la especialidad Menú Diario, autorizados en este restaurante y disponibles; el orden lo calcula el servidor por carga y menús en curso.",
    assignEmptyTitle: "No hay ningún candidato",
    assignEmptyReason:
      "Nadie del equipo reúne ahora mismo la especialidad Menú Diario, la autorización en este restaurante y la disponibilidad.",
    candidateColumn: "Persona",
    loadColumn: "Carga",
    menusColumn: "Menús en curso",
    assignReasonLabel: "Motivo (opcional)",
    assignSubmit: "Asignar",
    assignPending: "Asignando…",

    requestInfoTitle: "Pedir información",
    requestInfoHint: "El menú pasa a «Falta información» y el restaurante lee tu pregunta en su historial.",
    requestInfoLabel: "Qué falta",
    requestInfoSubmit: "Pedir información",

    publishTitle: "Marcar como publicado",
    publishHint:
      "Cuando ya lo has subido a LandingSite. Se registran fecha, hora, versión, plantilla y consumo, y se avisa al restaurante (§61).",
    publishSubmit: "Marcar como publicado",

    errorTitle: "Error de publicación",
    errorHint: "LandingSite no lo ha admitido. Se avisa a quien gestiona; después se puede reintentar o reasignar.",
    errorLabel: "Qué ha fallado",
    errorSubmit: "Registrar el error",

    refundTitle: "Devolver la actualización",
    refundHint:
      "Solo por un error del equipo (§60): devuelve al restaurante la actualización que consumió esta publicación, una sola vez y con motivo.",
    refundLabel: "Motivo",
    refundSubmit: "Devolver la actualización",
    refundDone: "Esta publicación ya tiene su actualización devuelta.",

    correctionsTitle: "Correcciones",
    correctionsEmpty: "Ninguna corrección pedida.",
    correctionKind: { client_request: "pedida por el restaurante", team_error: "por error del equipo" },
    correctionRequested: (when: string) => `Pedida el ${when}`,
    correctionGuaranteed: "garantizada",
    correctionNotGuaranteed: "sin garantía: llegó después de las 21:00 del día anterior",
    correctionCompleted: (when: string) => `Aplicada el ${when}`,
    correctionCompleteNoteLabel: "Nota (opcional)",
    correctionCompleteSubmit: "Marcar como aplicada",
    teamErrorTitle: "Corregir por error del equipo",
    teamErrorHint: "No consume la corrección mínima del restaurante ni ninguna actualización (RN-COR-07).",
    teamErrorLabel: "Qué se corrige",
    teamErrorSubmit: "Abrir la corrección",

    historyTitle: "Historial",
    historyEmpty: "Sin movimientos todavía.",
    nothingToDo: "Este menú está cerrado.",
    noPermissionHint: "Sobre esta publicación actúan quien la tiene asignada, el propietario y los administradores.",
    pending: "Un momento…",
    done: "Hecho.",
  },

  /**
   * Fase 2 · Hito 10 · Menú Diario visto por el restaurante (RN-MEN-01 a
   * 07, 09 a 12). Los nombres de estado NO están aquí: salen de
   * `naming.states.menu` (CA-21). Los de los tipos, de `naming.menuKinds`.
   */
  /**
   * §39, RN-ALE · los alérgenos del menú (R14). Desde el 19/09/2026
   * (decisión 47) son **una sola nota de texto libre para todo el menú**,
   * no una declaración plato a plato: manda el diseño definitivo móvil
   * (`Cuotly_movil.pdf`, página 125). El título es el de esa página,
   * literal, porque dice justo lo que Cuotly puede prometer.
   */
  allergens: {
    title: "Alérgenos (según la información proporcionada)",
    fieldLabel: "Alérgenos del menú (opcional)",
    fieldHint: "Una línea para todo el menú. Máximo 200 caracteres.",
    placeholder: "Contiene gluten, lácteos y frutos secos",
    remaining: (n: number) => (n === 1 ? "Queda 1 carácter." : `Quedan ${n} caracteres.`),
    tooLong: "La nota no puede pasar de 200 caracteres.",
    // RN-ALE-04 · sin nota NO se dice "no lleva alérgenos". Se dice que
    // nadie la ha escrito, que es lo que pasa. Las dos frases se parecen y
    // significan lo contrario para quien tiene una alergia (CLAUDE.md: si
    // no hay dato, se dice el motivo).
    empty: "Este menú no tiene nota de alérgenos.",
    emptyReason:
      "Nadie la ha escrito todavía. No significa que los platos no lleven ninguno: es que no se sabe.",
    // RN-ALE-03 · quién responde de lo que ahí pone.
    whoseResponsibility:
      "Esta información la declara el restaurante. Cuotly la guarda y la publica tal cual: no la comprueba ni la corrige.",
  },

  // R18 y A17 · comparar dos versiones de un menú. El cálculo vive en
  // `src/core/menu-diff.ts`; esto solo lo dice en palabras.
  menuDiff: {
    identical: "Las dos versiones dicen lo mismo.",
    changes: (n: number) => (n === 1 ? "Ha cambiado 1 cosa:" : `Han cambiado ${n} cosas:`),
    courses: {
      starters: "Primeros",
      mains: "Segundos",
      desserts: "Postres",
    },
    added: (platos: string) => `Se añade: ${platos}.`,
    removed: (platos: string) => `Se quita: ${platos}.`,
    reordered: "Los mismos platos, en otro orden.",
    drink: (antes: string, despues: string) => `Bebida: ${antes} → ${despues}.`,
    price: (antes: string, despues: string) => `Precio: ${antes} → ${despues}.`,
    note: (antes: string, despues: string) => `Nota: ${antes} → ${despues}.`,
    none: "sin poner",

    // RN-ALE-06 · la nota de alérgenos, como cualquier otro campo suelto.
    allergenNote: (antes: string, despues: string) => `Alérgenos: ${antes} → ${despues}.`,

    // R18 · los textos de la pantalla que compara.
    compareTitle: "Comparar versiones",
    compareHint:
      "Qué cambió de una versión a otra. Empieza por las dos últimas, que es lo que casi siempre se quiere saber.",
    compareFrom: "De la versión",
    compareTo: "A la versión",
    compareOption: (n: number) => `Versión ${n}`,
    compareSameVersion: "Elige dos versiones distintas.",
    compareNeedTwo:
      "Todavía no hay dos versiones que comparar: este menú solo se ha guardado una vez.",

    // A17 · el aviso de que alguien se adelantó, con la MISMA comparación.
    conflictTitle: "Alguien guardó mientras escribías",
    conflictHint: (n: number) =>
      `Mientras tenías esta pantalla abierta, alguien guardó la versión ${n}. Tu texto sigue aquí y no se ha perdido: mira qué cambió y, si quieres que valga lo tuyo, vuelve a guardar.`,
    conflictChanges: "Esto es lo que cambió respecto de la versión que tenías delante:",
  },

  dailyMenuClient: {
    title: "Menú Diario",
    subtitle: "Prepara tus menús, pide su publicación y descárgalos en PNG o PDF.",
    back: "Volver al restaurante",
    backToList: "Volver a Menú Diario",
    noServiceTitle: "Tu restaurante no tiene contratado Menú Diario",
    noServiceReason:
      "Menú Diario es un servicio aparte del plan de mantenimiento. Si quieres contratarlo, habla con el equipo de mantenimiento.",

    balanceTitle: "Actualizaciones de este ciclo",
    balanceLine: (available: number, included: number) => `Te quedan ${available} de ${included}`,
    balanceRenews: (day: string) => `Se renuevan el ${day}. No se acumulan.`,
    balanceHint: "Cada menú que mandas a publicar consume una actualización. Descargar el PNG o el PDF no consume nada.",

    templatesTitle: "Tus plantillas",
    templatesEmptyTitle: "Sin plantillas todavía",
    templatesEmptyReason:
      "El equipo de mantenimiento todavía no ha creado tus plantillas. Puedes preparar menús, pero no pedir su publicación ni descargarlos hasta que haya una.",
    templateOrigin: { included: "Incluida", quoted: "Presupuestada aparte" },

    menusTitle: "Tus menús",
    menusEmptyTitle: "Todavía no has preparado ningún menú",
    menusEmptyReason: "Cuando crees el primero, aparecerá aquí con su fecha y su estado.",
    menuLine: (kind: string, date: string) => `${kind} · ${date}`,

    newTitle: "Nuevo menú",
    newNameLabel: "Nombre",
    newNameHint: "Cómo lo verás en tu lista: «Menú del día», «Menú de Navidad»…",
    newKindLabel: "Tipo",
    newDateLabel: "Fecha del menú",
    newDateHint: "El día en que se sirve. Se puede cambiar hasta las 21:00 del día anterior.",
    newTemplateLabel: "Plantilla",
    newTemplateNone: "Sin plantilla",
    newSubmit: "Crear menú",
    newSubmitPending: "Creando…",
    newValidation: "El nombre y la fecha son obligatorios.",

    detailKind: "Tipo",
    detailDate: "Fecha",
    detailTemplate: "Plantilla",
    detailNoTemplate: "Sin plantilla: elige una para poder prepararlo.",

    deadlinesTitle: "Plazos",
    cutoffLine: (when: string) => `Puedes cambiar el contenido hasta las ${when}.`,
    publishByLine: (when: string) => `Si lo pides antes, se publica antes de las ${when}.`,
    guaranteed: "Publicación garantizada: pediste la publicación y guardaste la última versión antes del corte.",
    notGuaranteed:
      "Publicación no garantizada: la petición o algún cambio llegaron después de las 21:00 del día anterior. El equipo lo intentará, pero no está garantizado que entre en la publicación prevista.",
    notRequested: "Todavía no has pedido la publicación.",

    editorTitle: (version: number | null) => (version === null ? "Contenido" : `Contenido · versión ${version}`),
    editorLocked: "Un menú publicado o cancelado no se edita. Cópialo para crear un borrador nuevo.",
    startersLabel: "Primeros",
    mainsLabel: "Segundos",
    dessertsLabel: "Postres",
    linesHint: "Un plato por línea.",
    drinkLabel: "Bebida",
    priceLabel: "Precio (euros)",
    priceHint: "Por ejemplo, 14,50",
    noteLabel: "Nota u observación",
    saveVersion: "Guardar versión",
    saveVersionPending: "Guardando…",
    savedVersion: "Versión guardada.",
    savedAfterCutoff: "Versión guardada después de las 21:00: se acepta, pero no se garantiza que entre en la publicación prevista.",
    priceInvalid: "El precio no se entiende. Escríbelo como 14,50.",

    detailsTitle: "Datos del menú",
    saveDetails: "Guardar datos",
    saveDetailsPending: "Guardando…",
    savedDetails: "Datos guardados.",

    actionsTitle: "Qué puedes hacer",
    prepare: "Marcar como preparado",
    prepareHint: "Dice que el menú está completo. Necesita contenido guardado y plantilla.",
    requestPublication: "Pedir la publicación",
    requestPublicationHint: "Consume una actualización. El equipo lo publicará en tu web.",
    cancel: "Cancelar el menú",
    cancelReasonLabel: "Motivo",
    cancelHint: "Si ya habías pedido la publicación, se te devuelve la actualización.",
    cancelReasonRequired: "Di por qué lo cancelas.",
    copy: "Copiar para otro día",
    copyDateLabel: "Fecha del menú nuevo",
    copyHint: "Crea un borrador con este mismo contenido.",

    // R13 · copiar el anterior desde el listado, sin tener que abrirlo.
    copyPreviousTitle: "Copiar el menú anterior",
    copyPreviousHint: (nombre: string, fecha: string) =>
      `El último que hiciste antes de esa fecha es «${nombre}», del ${fecha}. Se copia su contenido a un borrador nuevo con el mismo nombre; lo cambias allí si quieres.`,
    copyPreviousSubmit: "Copiar el anterior",
    copyPreviousNoneTitle: "Todavía no hay un menú anterior que copiar",
    copyPreviousNoneReason:
      "No hay ningún menú con fecha anterior a mañana. Cuando hagas el primero, podrás copiarlo desde aquí.",
    answerTitle: "El equipo necesita información",
    answerHint: "Lo que te han preguntado está en el historial. Contesta aquí o guarda una versión nueva del menú.",
    answerLabel: "Respuesta",
    answer: "Enviar respuesta",
    nothingToDo: "Este menú ya está cerrado. Puedes copiarlo para otro día.",
    pending: "Un momento…",
    done: "Hecho.",

    downloadsTitle: "Descargar",
    downloadPng: "Descargar PNG",
    downloadPdf: "Descargar PDF",
    downloadsHint: "Descargar no consume ninguna actualización.",
    downloadsNeedContent: "Para descargarlo hace falta contenido guardado y una plantilla.",
    downloadsHistory: (n: number) => (n === 1 ? "1 descarga" : `${n} descargas`),

    // RN-COR-10 · la corrección mínima de un menú publicado.
    correctionTitle: "Pedir una corrección",
    correctionHint:
      "Una corrección mínima gratuita sobre el menú publicado: una errata, un precio, un plato mal escrito. Para cambiar el menú entero, cópialo para otro día.",
    correctionGuaranteedHint: "Si la pides ahora, el equipo la aplica antes de las 08:00 del día del menú.",
    correctionNotGuaranteedHint:
      "Son más de las 21:00 del día anterior: el equipo la aplicará cuando pueda, sin garantía de hora (RN-COR-10).",
    correctionLabel: "Qué hay que corregir",
    correctionSubmit: "Pedir la corrección",
    correctionUsed: "Este menú ya usó su corrección mínima gratuita.",
    correctionWindowClosed: "La ventana de corrección de este menú ya se cerró: pasaron 72 horas desde que se publicó.",
    correctionsListTitle: "Correcciones",
    correctionLine: (when: string) => `Pedida el ${when}`,
    correctionByTeam: "corrección por error del equipo de mantenimiento",
    correctionGuaranteed: "garantizada antes de las 08:00",
    correctionNotGuaranteed: "sin garantía de hora",
    correctionCompleted: (when: string) => `aplicada el ${when}`,
    correctionPending: "pendiente",

    historyTitle: "Historial",
    historyEmpty: "Sin movimientos todavía.",
    historyTeam: "Equipo de mantenimiento",
    versionsTitle: "Versiones",
    versionLine: (n: number, when: string) => `Versión ${n} · ${when}`,
    versionAfterCutoff: "después del corte",
    downloadLine: (format: string, when: string, byTeam: boolean) =>
      `${format.toUpperCase()} · ${when} · ${byTeam ? "equipo de mantenimiento" : "restaurante"}`,
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
    // Maquetas 09 a 12 y las seis vistas "sin datos": las secciones de
    // "Informes y datos". Las mismas para el equipo y para el restaurante.
    dataSectionsLabel: "Secciones de Informes y datos",
    dataSections: {
      summary: "Resumen",
      analytics: "Analítica",
      search: "Búsqueda",
      behavior: "Comportamiento",
      performance: "Rendimiento",
      opportunities: "Oportunidades",
    },
    // Maqueta 09 · "Informes generados" (§89 a §95, Hito 16).
    reportsTitle: "Informes generados",
    reportsEmptyTitle: "Todavía no hay informes de este restaurante",
    reportsEmptyReason:
      "Los informes se preparan desde la biblioteca: se eligen la familia, el periodo y las secciones, y Cuotly genera las cifras. Aquí aparecerán los de este restaurante.",
    reportsLink: "Ir a la biblioteca de informes",
    blocks: {
      establishmentData: "Datos",
      plan: "Plan",
      payments: "Pagos",
      users: "Usuarios",
      files: "Archivos",
      integrations: "Integraciones",
      internalNotes: "Notas internas",
      backups: "Copias de seguridad",
      serviceStatus: "Estado del servicio",
    },
    // Maqueta 06 · el enlace del encabezado. Solo aparece cuando hay sitio
    // web guardado: un botón que no lleva a ninguna parte es peor que no
    // tenerlo.
    // §38, RN-TRA · transferir el restaurante a otro espacio.
    transferTitle: "Transferir a otro espacio",
    transferHint:
      "Mueve el restaurante a otro espacio de mantenimiento. No es inmediato: el otro espacio tiene que aceptarlo, y hasta entonces todo sigue igual aquí.",
    transferWhatTravels:
      "Viaja con él todo su trabajo: solicitudes, trabajos, menús, archivos y conversaciones. El equipo del otro espacio los verá, también las conversaciones internas.",
    transferWhatStays:
      "Se quedan aquí los cobros, los pagos, el plan y el consumo del ciclo. La deuda es de quien la emitió, y el espacio nuevo empieza a facturar desde cero.",
    transferNeedsAccept: "Con deuda vencida no se transfiere: primero se cobra.",
    transferSpaceLabel: "Identificador del espacio de destino",
    transferSpaceHint:
      "Te lo da el otro espacio. No hay lista donde elegirlo: Cuotly no enseña los espacios de nadie más.",
    transferSpaceRequired: "Escribe el identificador del espacio de destino.",
    transferSubmit: "Proponer la transferencia",
    transferOnlyOwner:
      "Solo el propietario del espacio puede transferir un restaurante: esto lo saca del espacio entero, no lo cambia dentro.",
    transferWaiting:
      "Has propuesto transferir este restaurante. Está esperando a que el otro espacio lo acepte; mientras tanto, aquí no ha cambiado nada.",
    transferWithdraw: "Retirar la propuesta",
    transferWithdrawReason: "Motivo de la retirada (opcional)",
    transferOfferedTitle: "Te ofrecen este restaurante",
    transferOfferedHint:
      "Otro espacio quiere transferirte este restaurante. Si aceptas, pasa a ser tuyo con todo su trabajo dentro.",
    transferNoUndo:
      "No hay deshacer. Para devolverlo haría falta otra transferencia en sentido contrario, y el otro espacio tendría que aceptarla.",
    transferAccept: "Aceptar y traerlo a mi espacio",
    transferReject: "Rechazar",
    transferRejectReason: "Motivo del rechazo",

    // §38, RN-BCK · las copias de seguridad del contenido.
    // RN-ARC-10 · cuánto ocupa este restaurante (página 50 del diseño
    // definitivo móvil). Informativo: el límite es del espacio.
    // §40.1, RN-PAN-09 a 13 · el panel del restaurante como algo que se
    // crea (página 56 del diseño definitivo móvil).
    panelTitle: "Panel del restaurante",
    panelNotCreated: "No creado",
    panelNotCreatedReason:
      "Nadie del restaurante tiene acceso todavía, así que no hay panel al que entrar. Se crea dando el primer acceso.",
    panelCreateTitle: "Crear panel del restaurante",
    panelCreateHint: "Activa el acceso de este cliente a su panel para gestionar su presencia digital.",
    panelBelongsTitle: "El panel pertenece a este establecimiento.",
    panelBelongsHint:
      "No crea un espacio de mantenimiento ni contrata automáticamente la suscripción de Cuotly del cliente.",
    panelRestaurantLabel: "Restaurante",
    panelCodeLabel: "Código",
    panelGroupLabel: "Grupo",
    panelNoGroup: "Sin grupo",
    panelOwnerLabel: "Propietario del restaurante",
    panelOwnerHint:
      "Tiene que tener ya cuenta en Cuotly. Se le avisará con las instrucciones de acceso.",
    panelAccessTitle: "Revisar accesos del cliente",
    panelAccessItems: [
      "Podrá ver y editar la carta digital",
      "Podrá gestionar imágenes y contenidos",
      "Podrá ver informes de visualizaciones",
      "No tendrá acceso a otros establecimientos ni al espacio de mantenimiento",
    ] as const,
    panelCreateSubmit: "Crear panel",
    panelCreatePending: "Creando…",
    panelCreated: "Panel creado. Se ha avisado a quien lo gestiona.",
    panelCreatedTitle: "Creado",
    panelCreatedHint: (n: number) =>
      n === 1
        ? "1 persona del restaurante tiene acceso a su panel."
        : `${n} personas del restaurante tienen acceso a su panel.`,
    // CLAUDE.md · no se dice "No creado" cuando lo que ha pasado es que no
    // se ha podido mirar. No son lo mismo.
    panelUnknownTitle: "No hemos podido comprobarlo",
    panelUnknownReason:
      "No se ha podido leer quién tiene acceso a este restaurante, así que no sabemos si tiene panel. No es lo mismo que no tenerlo.",
    storageTitle: "Almacenamiento",
    storageValue: (restaurante: string, tamano: string) => `${restaurante}: ${tamano}`,
    storageNotAQuota:
      "Es lo que ocupan los archivos de este restaurante. No es una cuota suya: el almacenamiento incluido es del espacio y no se reparte por restaurante, así que ninguno se queda sin sitio.",
    storageSpaceLink: "Ver el almacenamiento del espacio",
    // CLAUDE.md · si no hay dato, se dice el motivo. Aquí el motivo es un
    // permiso, y decirlo entero es mejor que un cero: un número parcial
    // llamado "lo que ocupa el restaurante" sería mentira.
    storageHiddenTitle: "No podemos darte esta cifra",
    storageHiddenReason:
      "Sumarla exige ver todos los archivos del restaurante, incluidos los de facturación, y tu permiso no llega ahí. Un total con solo los que ves sería más pequeño de lo que ocupa de verdad.",
    backupsTitle: "Copias de seguridad",
    backupsHint:
      "Una copia diaria de lo que Cuotly guarda de este restaurante: sus datos, sus solicitudes, sus menús y sus conversaciones. Se guardan las treinta últimas.",
    backupsNoRestore:
      "Restaurar es descargar la copia y volver a poner a mano lo que haga falta. Cuotly no deshace nada: reponer los datos de otra fecha machacaría la auditoría, los consumos y los cobros posteriores, y todo esto está construido sobre libros que no se reescriben.",
    backupsInventory:
      "La copia lleva el listado de los archivos —nombre, tamaño y fecha—, no los archivos en sí: esos se descargan uno a uno desde donde están.",
    backupsContents: (solicitudes: number, menus: number, archivos: number) =>
      `${solicitudes} solicitudes · ${menus} menús · ${archivos} archivos`,
    backupsDownload: "Descargar",
    backupsCreate: "Generar una copia ahora",
    backupsDone: "Copia generada.",
    backupsEmptyTitle: "Todavía no hay ninguna copia",
    backupsEmptyReason:
      "La primera se genera con el barrido diario. Si la necesitas antes, puedes generarla ahora.",

    // M84 y M47 · el bloque "Estado del servicio".
    serviceStatusTitle: "Estado del servicio",
    serviceStatusHint:
      "Lo que decide una persona: archivar, reactivar y registrar la baja que llegó por teléfono. Lo demás lo mueve el servidor solo —pausado y suspendido por impago, solo lectura al vencer el periodo— y no se toca a mano.",
    serviceReasonLabel: "Motivo",
    serviceReasonRequired: "Escribe el motivo: dentro de seis meses alguien va a preguntar por qué.",
    servicePending: "Guardando…",
    serviceDone: "Hecho. Queda en el historial del restaurante con su motivo.",
    serviceArchiveTitle: "Archivar el restaurante",
    serviceArchiveHint:
      "Sale de la lista del día a día y deja de darse servicio. No se borra nada: su historial, sus archivos y sus cobros siguen donde están, y se puede reactivar.",
    serviceArchiveSubmit: "Archivar",
    serviceReactivateTitle: "Reactivar el restaurante",
    serviceReactivateHint:
      "Vuelve a estar activo y a darse servicio. Si tiene deuda vencida, no se reactiva desde aquí: se reactiva al cobrar.",
    serviceReactivateSubmit: "Reactivar",
    serviceTerminationTitle: "Baja comunicada por fuera de Cuotly",
    serviceTerminationHint:
      "Para la baja que llegó por teléfono o por correo. El servicio NO se corta ahora: pasa a Finalizando, que quiere decir que no se renueva. Cuándo acaba lo marcan el periodo pagado y la permanencia.",
    serviceTerminationSubmit: "Registrar la baja",
    serviceTerminationAlready:
      "Este restaurante ya ha comunicado la baja: está en Finalizando y no se renueva.",
    serviceTerminationNoService:
      "Este restaurante ya no tiene servicio activo, así que no hay baja que registrar.",
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
    digitalHint:
      "Lo que cada fuente conectada ha traído en los 28 últimos días completos, con su antigüedad. No es un informe: los informes (§89 a §95) llegan en el Hito 16.",

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
    serviceUsageEmptyTitle: "El uso del servicio se ve en Menú Diario",
    serviceUsageEmptyReason:
      "Las actualizaciones consumidas y el saldo del ciclo (RN-CON-02) están en la pantalla de Menú Diario del restaurante, que es donde se piden.",
    // RN-COM-08 · qué precio se le cobra, dicho por el servidor (decisión 20).
    servicePricePremium: "Precio con plan Premium+ activo (RN-COM-08)",
    servicePriceStandard: "Precio sin plan Premium+ (RN-COM-08)",
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
    // §84 · desde el Hito 12 los presupuestos existen: aquí se listan con
    // el estado que deriva el servidor y se enlaza a Finanzas.
    quotesTitle: "Presupuestos",
    quotesEmptyTitle: "Sin presupuestos",
    quotesEmptyReason:
      "A este restaurante no se le ha presupuestado nada aparte de su plan. Un presupuesto nace desde una solicitud que no entra en el plan, o desde Finanzas.",
    quotesLink: "Ver y crear presupuestos en Finanzas",
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
    // RN-EST-15/16 · dos roles del lado cliente. `consulta` se retiró el
    // 19/09/2026 —era un Editor con todos los permisos apagados— pero su
    // nombre se queda aquí para que una fila antigua no se pinte con el
    // identificador en crudo.
    clientRoles: {
      global_owner: "Propietario global",
      local_owner: "Propietario del restaurante",
      editor: "Editor",
      consulta: "Consulta (retirado)",
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
    // RN-ACC-13 · el correo no tenía cuenta. No está dentro todavía: tiene
    // que abrir un enlace y ponerse una contraseña, y decirle "acceso
    // concedido" haría esperar a quien invita.
    grantDoneInvited:
      "Invitación enviada. Esa persona todavía no tiene cuenta en Cuotly: entrará cuando abra el enlace del correo y elija su contraseña.",

    // RN-PAN-14 · la lista de invitaciones del restaurante.
    invitations: {
      title: "Invitaciones",
      empty: "No hay ninguna invitación pendiente.",
      failed:
        "No se ha podido cargar la lista de invitaciones. Vuelve a intentarlo; no significa que no haya ninguna.",
      states: {
        pending_review: "En revisión",
        approved: "Enviada, sin aceptar",
        rejected: "Rechazada",
        expired: "Caducada",
      },
      // RN-PAN-15 · el motivo sí; quién la revisó, nunca.
      rejectedBecause: (motivo: string) => `Motivo: ${motivo}`,
      expiresOn: (fecha: string) => `Caduca el ${fecha}`,
      pendingHint:
        "El equipo de mantenimiento tiene que aprobarla antes de que esa persona pueda entrar.",
      approve: "Aprobar",
      reject: "Rechazar",
      rejectReasonLabel: "Motivo del rechazo",
      rejectReasonHint: "Lo lee quien la envió, así que conviene que se entienda.",
      rejectReasonRequired: "Un rechazo lleva motivo.",
      cancel: "Cancelar invitación",
      reviewedOk: "Hecho.",
    },

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

    // ---- Gestión · Integraciones (maqueta 17) ---------------------
    integrationsTitle: "Integraciones",
    integrationsHint: "Consulta las fuentes de datos conectadas a este restaurante.",

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

  /**
   * Fase 3 · Hito 14 · integraciones analíticas (PRD §27, RN-INT): el
   * bloque de la ficha (maqueta 17), la tarjeta del restaurante, el resumen
   * de "Informes y datos" y la sección de Ajustes.
   */
  integrations: {
    providers: {
      ga4: { name: "Google Analytics 4", description: "Analítica web del restaurante." },
      search_console: { name: "Google Search Console", description: "Rendimiento en buscadores." },
      business_profile: { name: "Google Business Profile", description: "Ficha del restaurante." },
      clarity: { name: "Microsoft Clarity", description: "Mapas de calor y grabaciones." },
      pagespeed: { name: "PageSpeed Insights", description: "Rendimiento y velocidad web." },
    },
    // RN-INT-03 · los siete estados de §117, con su nombre.
    states: {
      not_connected: "No conectada",
      pending_authorization: "Pendiente de autorización",
      connected: "Conectada",
      syncing: "Sincronizando",
      needs_attention: "Requiere atención",
      error: "Error",
      disconnected: "Desconectada",
    },
    failureKinds: {
      transient: "Fallo pasajero: Cuotly vuelve a intentarlo sola.",
      authorization: "Hace falta volver a autorizar la cuenta.",
      configuration: "Hay que revisar la configuración: la propiedad, el sitio o la clave.",
    },
    // §117 · lo que se enseña de cada integración.
    accountLabel: "Cuenta de origen",
    accountNone: "No conectada",
    propertyLabel: "Propiedad",
    lastSyncLabel: "Última sincronización",
    lastSuccessLabel: "Última correcta",
    nextAttemptLabel: "Próximo intento",
    nextAttemptNone: "—",
    nextAttemptWaitingPerson: "Cuando alguien vuelva a autorizar",
    errorLabel: "Error",
    staleBadge: "Dato desactualizado",
    checkPendingBadge: "Comprobación en cola",
    revocationPendingNote: "La autorización se revocará en Google en la próxima tanda de la cola.",
    frequency: { daily: "Se sincroniza a diario", weekly: "Se sincroniza cada semana" },
    noSyncNowNote:
      "No existe «Sincronizar ahora»: la sincronización la programa el sistema (§117). Al conectar, la primera pasada entra en la siguiente tanda de la cola.",

    // Acciones (RN-INT-05: solo quien gestiona conexiones las ve; el servidor las vuelve a comprobar).
    connectOAuth: "Conectar con Google",
    connectApiKey: "Introducir clave",
    replaceApiKey: "Sustituir clave",
    reauthorize: "Volver a autorizar",
    check: "Comprobar conexión",
    checkPending: "Pidiendo comprobación…",
    checkRequested: "Comprobación pedida: la hace la cola y el resultado se verá aquí.",
    disconnect: "Desconectar",
    disconnectPending: "Desconectando…",
    disconnectReasonLabel: "Motivo (opcional)",
    disconnectConfirm: "Se revocará la autorización y dejará de sincronizarse. Los datos ya importados se conservan (RN-INT-07).",
    cancel: "Cancelar autorización",
    cancelPending: "Cancelando…",

    // El formulario de conectar.
    propertyField: {
      ga4: "Identificador de la propiedad de GA4 (por ejemplo, 123456789)",
      search_console: "Sitio en Search Console (por ejemplo, https://restaurante.es/ o sc-domain:restaurante.es)",
      business_profile: "Identificador de la ubicación de Business Profile (por ejemplo, locations/123456789)",
      clarity: "Nombre del proyecto de Clarity (para reconocerlo; el token ya es del proyecto)",
      pagespeed: "URL que mide PageSpeed (por defecto, la web del restaurante)",
    },
    propertyRequired: "Indica la propiedad antes de conectar.",
    apiKeyField: {
      clarity: "Token de exportación de datos de Clarity (Settings › Data Export)",
      pagespeed: "Clave de API de Google Cloud con PageSpeed Insights habilitada",
    },
    apiKeyRequired: "Pega la clave antes de guardar.",
    apiKeyHint:
      "La clave se cifra en el servidor antes de guardarse y nadie la vuelve a ver, ni siquiera tú (§126). Para cambiarla, sustitúyela.",
    apiKeySaved: "Clave guardada y cifrada. La primera sincronización entra en la siguiente tanda de la cola.",
    connectPending: "Conectando…",
    savePending: "Guardando…",
    saveApiKey: "Guardar clave",
    oauthRedirectNote: "Se abrirá Google para elegir la cuenta y aceptar el permiso de lectura. Al volver, la integración quedará conectada.",

    // Quién puede (RN-INT-05, §126), dicho cuando no se puede.
    onlySpaceOwnerKeys: "Solo el propietario del espacio introduce o sustituye una clave (§126).",
    onlyOwnersAuthorize:
      "La autorización de Google la concede el propietario del espacio o el del restaurante con su cuenta (RN-INT-05); un administrador la comprueba, la cancela o la desconecta.",
    workerReadOnly: "Consultas el estado y los datos; conectar y desconectar es de quien gestiona la cartera (RN-INT-05).",
    clientReadOnly: "Puedes ver el estado de las integraciones. Conectarlas es del propietario del restaurante o del equipo de mantenimiento.",
    clientOwnerHint:
      "Como propietario puedes autorizar tu cuenta de Google para GA4, Search Console y Business Profile. Clarity y PageSpeed las conecta el equipo con su clave.",

    // Por qué no se puede conectar (§178: el motivo, no un botón que falla).
    vaultNotConfigured:
      "No se pueden guardar credenciales en este entorno: falta la clave de cifrado del servidor (INTEGRATIONS_VAULT_KEY).",
    oauthNotConfigured:
      "La conexión con Google no está configurada en este entorno (GOOGLE_OAUTH_CLIENT_ID). Clarity y PageSpeed sí se pueden conectar con su clave.",
    archivedNote: "Un restaurante archivado no conecta integraciones: al archivarlo se revocaron todas (RN-INT-06).",

    // Lo que dice la vuelta de Google.
    flash: {
      connected: "Integración conectada. La primera sincronización entra en la siguiente tanda de la cola.",
      denied: "Google no concedió el permiso. La integración sigue pendiente de autorización; puedes intentarlo otra vez o cancelarla.",
      state_invalid: "La vuelta de Google no coincide con ninguna conexión empezada desde aquí (enlace caducado o de otra sesión). Empieza de nuevo.",
      wrong_user: "La autorización la empezó otra persona. Inicia sesión con tu cuenta y empieza de nuevo.",
      exchange_failed: "Google no devolvió la autorización completa. Inténtalo otra vez.",
      store_failed: "La autorización llegó pero no se pudo guardar. El motivo está en el registro del servidor.",
      not_configured: "La conexión con Google no está configurada en este entorno.",
    },

    // Plataformas externas (§120, §121): no son integraciones y se dice.
    platformsTitle: "Plataformas externas",
    platformsHint:
      "No son integraciones monitorizadas (§120): se anotan como herramientas del restaurante y no tienen sección de control.",
    webPlatformLabel: "Web del restaurante",
    webPlatformNone: "Sin plataforma web registrada en la ficha.",
    openSite: "Ver sitio",
    reservationsLabel: "Reservas y delivery",
    reservationsNone: "Sin plataformas de reservas o delivery registradas todavía: la ficha no tiene ese campo (§120, pendiente).",
    landingSiteNote: "La publicación de Menú Diario en LandingSite es manual (§121).",

    // El resumen de "Informes y datos" (§178).
    summaryWindow: "Últimos 28 días completos",
    dataUntil: (day: string) => `Datos hasta ${day}`,
    syncedAt: (moment: string) => `Sincronizado el ${moment}`,
    coveredDays: (n: number, total: number) => `${n} de ${total} días con dato`,
    insufficientTitle: "Periodo insuficiente",
    staleTitle: "Última sincronización",
    errorTitle: "Error en la última sincronización",
    noDataTitle: "Todavía no hay datos",
    notConnectedTitle: "Integración no conectada",
    strategies: { mobile: "Móvil", desktop: "Escritorio" },
    // Maqueta 10 · los dispositivos que nombra GA4, en español. Lo que no
    // esté en esta lista se enseña como lo manda la fuente: es un dato
    // suyo, no una etiqueta de Cuotly.
    devices: { mobile: "Móvil", desktop: "Ordenador", tablet: "Tablet", smart_tv: "Televisión" } as Record<string, string | undefined>,
    // El botón que despliega el formulario de conectar (la maqueta dibuja
    // las cinco conectadas, así que el formulario no aparece en ella).
    connectToggle: "Conectar esta fuente",
    // El nombre de cada métrica del catálogo (`METRICS_BY_PROVIDER`).
    // `integrations.test.ts` comprueba que ninguna se queda sin él.
    metrics: {
      users: "Usuarios",
      sessions: "Sesiones",
      page_views_by_page: "Visualizaciones por página",
      sessions_by_source: "Sesiones por procedencia",
      sessions_by_device: "Sesiones por dispositivo",
      sessions_by_location: "Sesiones por ubicación",
      conversions_by_event: "Eventos clave",
      conversions_by_device: "Eventos clave por dispositivo",
      clicks: "Clics",
      impressions: "Impresiones",
      ctr: "CTR medio",
      position: "Posición media",
      clicks_by_query: "Clics por consulta",
      clicks_by_page: "Clics por página",
      impressions_by_query: "Impresiones por consulta",
      ctr_by_query: "CTR por consulta",
      position_by_query: "Posición por consulta",
      profile_impressions: "Veces que apareció la ficha",
      impressions_by_surface: "Impresiones por superficie",
      website_clicks: "Clics a la web",
      call_clicks: "Llamadas",
      direction_requests: "Cómo llegar",
      conversations: "Conversaciones",
      bookings: "Reservas",
      bot_sessions: "Sesiones de robots",
      distinct_users: "Usuarios distintos",
      pages_per_session: "Páginas por sesión",
      scroll_depth: "Profundidad de scroll media",
      engagement_time_seconds: "Tiempo de interacción",
      dead_clicks: "Clics muertos",
      rage_clicks: "Clics de rabia",
      quick_backs: "Vueltas rápidas",
      excessive_scroll: "Scroll excesivo",
      script_errors: "Errores de script",
      error_clicks: "Clics con error",
      performance_score_by_strategy: "Puntuación de rendimiento",
      lcp_ms_by_strategy: "LCP (Largest Contentful Paint)",
      cls_by_strategy: "CLS (Cumulative Layout Shift)",
      tbt_ms_by_strategy: "TBT (Total Blocking Time)",
      fcp_ms_by_strategy: "FCP (First Contentful Paint)",
      speed_index_ms_by_strategy: "Speed Index",
      inp_ms_by_strategy: "INP (Interaction to Next Paint)",
      optimized_images_savings_kb_by_strategy: "Ahorro comprimiendo imágenes",
      responsive_images_savings_kb_by_strategy: "Ahorro sirviendo imágenes a su tamaño",
    },

    // Vista 17 · las tres tarjetas de abajo, con sus palabras.
    webPlatformProject: "Proyecto",
    webPlatformLastPublication: "Última publicación",
    webPlatformLastPublicationNone: "Sin publicaciones de Menú Diario todavía",
    webPlatformNote: "Web del restaurante en el ecosistema Cuotly.",
    reservationsTitle: "Reservas",
    deliveryTitle: "Delivery",
    externalPlatformNote: "Plataforma externa utilizada",
    externalPlatformNone: "Sin plataforma registrada: la ficha no tiene ese campo todavía (§120).",

    // Las seis secciones de "Informes y datos" (maquetas 09 a 12 y las
    // seis vistas "sin datos"), con las palabras del diseño.
    sections: {
      summary: {
        title: "Informes y datos",
        hint: "Consulta los datos de tu restaurante cuando las fuentes estén disponibles.",
        emptyTitle: "Todavía no hay datos disponibles",
        emptyHint: "Conecta una fuente de datos o espera a que termine su primera sincronización. Los datos aparecerán aquí cuando estén disponibles.",
      },
      analytics: {
        title: "Analítica",
        hint: "Datos de visitas y uso de tu web.",
        emptyTitle: "Todavía no hay datos de analítica",
        emptyHint: "Conecta Google Analytics 4 o espera a que termine la primera sincronización.",
      },
      search: {
        title: "Búsqueda",
        hint: "Visibilidad de tu web y de tu ficha en Google.",
        emptyTitle: "Todavía no hay datos de búsqueda",
        emptyHint: "Conecta Google Search Console o Google Business Profile, o espera a que termine la primera sincronización.",
      },
      behavior: {
        title: "Comportamiento",
        hint: "Cómo interactúan los visitantes con tu web.",
        emptyTitle: "Todavía no hay datos de comportamiento",
        emptyHint: "Conecta Microsoft Clarity o espera a que termine la primera sincronización.",
      },
      performance: {
        title: "Rendimiento",
        hint: "Velocidad y experiencia de uso de tu web.",
        emptyTitle: "Todavía no hay datos de rendimiento",
        emptyHint: "Los resultados aparecerán cuando esté disponible el primer análisis de PageSpeed Insights.",
      },
      // Hito 15 · las nueve reglas de §96 con los umbrales de la decisión
      // 26. El hueco ya no dice "pendiente de decisión": dice que no ha
      // saltado ninguna, que es otra cosa y es buena noticia.
      opportunities: {
        title: "Oportunidades",
        hint: "Mejoras basadas en los datos de tu restaurante.",
        emptyTitle: "Ninguna oportunidad abierta",
        emptyHint: "Cuotly revisa cada día los datos de las fuentes conectadas. Cuando una regla salte, la oportunidad aparecerá aquí con las cifras que la dispararon.",
      },
    },
    manageIntegrations: "Gestionar integraciones",
    sourcesStatusTitle: "Estado de las fuentes",
    /**
     * RN-INT-09 (decisión 48) · "Cuotly Insights" es el nombre que el
     * diseño (páginas 41 y 44) le da al resumen que Cuotly ya calcula a
     * partir de las fuentes conectadas. NO es una conexión: no se
     * autoriza, no sincroniza y no tiene cuenta. La fila lo dice, porque
     * ponerlo entre las demás sin decirlo prometería una fuente que no
     * existe.
     */
    insightsName: "Cuotly Insights",
    insightsActive: "Activo",
    insightsNothingYet: "Sin nada que resumir",
    insightsInfo:
      "No es una conexión: es la lectura propia de Cuotly sobre las fuentes que tengas conectadas.",
    insightsInfoEmpty:
      "No es una conexión. Cuando alguna fuente traiga datos, Cuotly los resumirá aquí.",
    sourceOfDataTitle: "Fuente de datos",
    sourceColumn: "Fuente",
    stateColumn: "Estado",
    updatedColumn: "Última actualización",
    infoColumn: "Información",
    // Lo que se enseña como estado en la tabla cuando la conexión está
    // hecha y no ha traído nada todavía (vistas sin datos 1/6 y 3/6).
    waitingFirstSync: "Esperando primera sincronización",
    waitingFirstAnalysis: "Esperando primer análisis",
    // La columna "Información": los cinco motivos de §178 con las
    // palabras del diseño, y con dato, hasta cuándo llega.
    sourceInfo: {
      not_connected: "Conecta una cuenta para empezar.",
      pending_authorization: "Falta autorizar el acceso.",
      disconnected: "Desconectada. Los datos ya importados se conservan (RN-INT-07).",
      no_data_yet: "Conexión completada. Aún no hay datos importados.",
      no_analysis_yet: "Todavía no hay resultados disponibles.",
      error: "La última sincronización falló. Cuotly vuelve a intentarlo sola.",
      needs_attention: "Hace falta una persona: volver a autorizar o revisar la configuración.",
      stale: "Dato desactualizado: la última sincronización correcta es antigua.",
      insufficient_period: "Hay datos, pero todavía de pocos días.",
      ok: (day: string) => `Datos hasta el ${day}.`,
    },
    sourcesFootnote: "Si ya está conectada, los datos aparecerán tras la primera sincronización.",
    // Las cifras con su variación (maquetas 10, 11 y 22.02).
    changeVsPrevious: "vs. 28 días anteriores",
    changeNoPrevious: "sin periodo anterior con dato",
    changeUp: "sube",
    changeDown: "baja",
    changeFlat: "igual",
    sourceOfData: "Fuente de datos",
    lastDays: (n: number) => `Últimos ${n} días`,
    measuredOn: (day: string) => `Datos del ${day}`,
    metricColumn: "Métrica",
    valueColumn: "Valor",
    changeColumn: "Variación",
    // Analítica (maqueta 10).
    usersSessionsTitle: "GA4 — Usuarios y sesiones",
    devicesTitle: "Dispositivos",
    topPagesTitle: "Páginas más visitadas",
    pageColumn: "Página",
    viewsColumn: "Visualizaciones",
    trafficSourcesTitle: "Procedencia de las sesiones",
    trafficSourceColumn: "Procedencia",
    sessionsColumn: "Sesiones",
    locationsTitle: "Ubicaciones aproximadas",
    locationColumn: "Ubicación",
    conversionsTitle: "Eventos clave",
    conversionColumn: "Evento",
    conversionsColumn: "Conversiones",
    // Búsqueda (maqueta 10 y 11).
    searchPerformanceTitle: "Search Console — Rendimiento",
    topQueriesTitle: "Consultas principales",
    queryColumn: "Consulta",
    clicksColumn: "Clics",
    searchPagesTitle: "Páginas que aparecen en Google",
    businessProfileTitle: "Google Business Profile — Visibilidad",
    surfacesTitle: "Dónde apareció la ficha",
    surfaceColumn: "Superficie",
    impressionsColumn: "Impresiones",
    surfaces: {
      maps_desktop: "Maps (escritorio)",
      maps_mobile: "Maps (móvil)",
      search_desktop: "Búsqueda (escritorio)",
      search_mobile: "Búsqueda (móvil)",
    },
    // Comportamiento (maqueta 11).
    clarityTitle: "Microsoft Clarity — Comportamiento",
    frictionTitle: "Señales de fricción",
    // Rendimiento (maqueta 11 y 22.03).
    pagespeedTitle: "PageSpeed Insights — Rendimiento",
    pagespeedScoreTitle: "Puntuación de rendimiento",
    pagespeedNoStrategy: "Sin medición en la ventana.",
    // Las dos gráficas: lo que se dice en la leyenda y en la tabla de datos.
    chartTableToggle: "Ver los datos en tabla",
    chartDayColumn: "Día",
    chartNoDays: "Ningún día con dato en la ventana.",
    // Lo que las gráficas necesitan decir cuando la serie no está completa.
    devicesOther: "Otros",

    // Ajustes › Integraciones.
    settingsTitle: "Integraciones",
    settingsHint:
      "El estado de las cinco fuentes en todos los restaurantes del espacio. Se conectan desde la ficha de cada restaurante (Gestión › Integraciones).",
    settingsEnvTitle: "Configuración del servidor",
    settingsVaultOk: "Clave de cifrado de credenciales: configurada.",
    settingsVaultMissing: "Clave de cifrado de credenciales: falta INTEGRATIONS_VAULT_KEY. Sin ella no se puede conectar ninguna fuente.",
    settingsOAuthOk: "Cliente OAuth de Google: configurado.",
    settingsOAuthMissing: "Cliente OAuth de Google: falta GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET. GA4, Search Console y Business Profile no se pueden conectar hasta configurarlo.",
    settingsEmpty: "Ningún restaurante tiene una integración empezada todavía.",
    settingsEstablishmentColumn: "Restaurante",
    settingsProviderColumn: "Fuente",
    settingsStateColumn: "Estado",
    settingsAccountColumn: "Cuenta conectada",
    settingsLastSyncColumn: "Última sincronización",
    settingsOpen: "Abrir en la ficha",
    credentialsTitle: "Credenciales guardadas",
    credentialsHint:
      "Solo el propietario ve que existen: tipo, versión de la clave de cifrado y caducidad. El valor no lo ve nadie (§126).",
    credentialKinds: { oauth_refresh_token: "Autorización de Google", api_key: "Clave API" },
    credentialKeyVersion: (v: number) => `Cifrada con la clave v${v}`,
    credentialReplaced: "Sustituida",
    credentialRevoked: "Revocada",
    credentialActive: "Vigente",
  },

  /**
   * Fase 2 · Hito 12 · presupuestos adicionales (§84), lado del equipo:
   * la lista en Finanzas, el formulario y la ficha.
   */
  quotesTeam: {
    title: "Presupuestos",
    subtitle: "Lo que se cobra aparte del plan: trabajos fuera de bolsa y plantillas de Menú Diario (§84).",
    listEmptyTitle: "No hay presupuestos",
    listEmptyReason: "Un presupuesto nace desde una solicitud que no entra en el plan, o desde aquí.",
    newLink: "Nuevo presupuesto",
    codeColumn: "Código",
    establishmentColumn: "Restaurante",
    conceptColumn: "Concepto",
    totalColumn: "Total",
    stateColumn: "Estado",
    open: "Abrir",
    backToFinance: "Volver a finanzas",

    // El formulario (crear y corregir un borrador).
    newTitle: "Nuevo presupuesto",
    editTitle: "Corregir el borrador",
    establishmentLabel: "Restaurante",
    requestLabel: "Solicitud",
    requestNone: "Sin solicitud: el presupuesto crea la solicitud y el trabajo al aceptarse",
    conceptLabel: "Concepto",
    descriptionLabel: "Alcance (lo que leerá el restaurante)",
    baseLabel: "Base imponible (euros, sin IVA)",
    outcomeLabel: "Qué se presupuesta",
    outcomes: {
      job: "Un trabajo (crea solicitud y trabajo, sin consumir bolsa)",
      menu_template: "Una plantilla de Menú Diario (RN-MEN-11)",
    },
    categoryLabel: "Categoría del cambio",
    categoryHint: "Un trabajo presupuestado necesita categoría: es lo que decide su plazo y sus puntos de carga.",
    requiresPaymentLabel: "Exigir el pago antes de comenzar",
    requiresPaymentHint:
      "§84: con esto marcado, Comenzar espera al cobro o a una autorización registrada. Sin marcar, el trabajo puede empezar con el cobro pendiente.",
    createSubmit: "Guardar el borrador",
    createPending: "Guardando…",
    saveSubmit: "Guardar los cambios",
    savePending: "Guardando…",
    saveDone: "Borrador guardado.",
    baseInvalid: "Escribe la base imponible en euros, cero o más.",
    conceptRequired: "Ponle concepto: es lo que verá el restaurante.",
    establishmentRequired: "Elige el restaurante.",
    noPermissionTitle: "Sin permiso para presupuestar",
    noPermissionReason: "Presupuestar es del propietario y de los administradores (manage_requests).",

    // La ficha.
    detailTitle: (code: string) => `Presupuesto ${code}`,
    amountsTitle: "Importes",
    baseRow: "Base imponible",
    taxRow: (rate: string) => `IVA (${rate} %)`,
    totalRow: "Total",
    taxFrozenHint: "El tipo se copió del espacio al crear el presupuesto y no cambia (P4).",
    requestLink: "Ver la solicitud",
    jobLink: "Ver el trabajo",
    chargeTitle: "Cobro",
    chargeNone: "Todavía no hay cobro: nace cuando el restaurante acepta.",
    chargeLine: (total: string, due: string) => `${total} · vence el ${due}`,
    chargeOutstanding: (outstanding: string) => `Deuda viva: ${outstanding}`,
    chargePaidHint: "Cobrado: el pago se registró desde Finanzas.",
    paymentTitle: "Pago e inicio",
    paymentRequired: "Exige el pago antes de comenzar.",
    paymentNotRequired: "No exige el pago antes de comenzar.",
    startAuthorized: (day: string) => `Inicio autorizado antes del pago el ${day}.`,
    startAuthorizedReason: (reason: string) => `Motivo: ${reason}`,
    authorizeTitle: "Autorizar el inicio antes del pago",
    authorizeHint:
      "Queda registrado con tu nombre, la fecha y el motivo (§84). Solo el propietario y los administradores con finanzas.",
    authorizeReasonLabel: "Motivo (opcional)",
    authorizeSubmit: "Autorizar el inicio",
    authorizePending: "Autorizando…",
    authorizeDone: "Inicio autorizado.",
    sendTitle: "Enviar al restaurante",
    sendHint:
      "Al enviarlo, el propietario del restaurante recibe un aviso y puede aceptarlo o rechazarlo. Un presupuesto enviado ya no se corrige.",
    sendSubmit: "Enviar el presupuesto",
    sendPending: "Enviando…",
    sendDone: "Presupuesto enviado.",
    decisionTitle: "Respuesta del restaurante",
    decidedAt: (day: string) => `Respondido el ${day}.`,
    decisionReason: (reason: string) => `Motivo: ${reason}`,
    decidedByTeam:
      "La respuesta la dio el restaurante fuera de Cuotly y la registró el equipo en su nombre. Quién, en el historial.",
    rejectedHint:
      "Rechazado. La solicitud, si la hay, sigue donde estaba: puedes enviar otro presupuesto o el restaurante puede no continuarla.",
    waitingHint: "Enviado. Esperando la respuesta del restaurante.",

    // Decisión 21 · el equipo registra la respuesta en nombre del restaurante.
    answerForClientTitle: "Registrar la respuesta del restaurante",
    answerForClientHint:
      "Si el restaurante te ha contestado fuera de Cuotly (por teléfono, por correo, en persona), regístralo aquí en su nombre. Solo el propietario y los administradores. Queda en el historial con tu nombre, la fecha y el motivo, y el restaurante recibe un aviso de lo registrado.",
    onBehalfReasonLabel: "Cómo y cuándo respondió el restaurante",
    onBehalfReasonHint: "Obligatorio: es lo único que cuenta cómo se dio la respuesta.",
    onBehalfReasonRequired: "Di cómo y cuándo respondió el restaurante: sin motivo no se registra.",
    acceptForClientSubmit: "Registrar que lo aceptó",
    acceptForClientPending: "Registrando…",
    acceptForClientDone: "Aceptación registrada en nombre del restaurante.",
    rejectForClientSubmit: "Registrar que lo rechazó",
    rejectForClientPending: "Registrando…",
    rejectForClientDone: "Rechazo registrado en nombre del restaurante.",
    templateHint: "Aceptado: la plantilla se crea desde Menú Diario del restaurante, colgando de este presupuesto.",
    historyTitle: "Historial",
    historyEmpty: "Sin apuntes todavía.",
    notFoundTitle: "Presupuesto no encontrado",
    notFoundReason: "No existe o no tienes acceso a él.",
  },

  /**
   * §84, lado del restaurante: lo que ve en su facturación y en su
   * solicitud, y los dos botones que son suyos.
   */
  quotesClient: {
    title: "Presupuestos",
    emptyTitle: "No tienes presupuestos",
    emptyReason: "Cuando el equipo te presupueste algo aparte de tu plan, aparecerá aquí.",
    codeColumn: "Código",
    conceptColumn: "Concepto",
    totalColumn: "Total (con IVA)",
    stateColumn: "Estado",
    preparingTitle: "El equipo está preparando un presupuesto",
    preparingReason:
      "Este cambio se cobra aparte de tu plan. Cuando te lo envíen podrás aceptarlo o rechazarlo aquí.",
    quoteTitle: "Presupuesto",
    amounts: (base: string, tax: string, total: string) => `${base} + IVA ${tax} = ${total}`,
    paymentRequiredHint: "El trabajo empieza cuando se confirme el pago.",
    paymentNotRequiredHint: "El trabajo puede empezar antes del pago.",
    answerTitle: "Tu respuesta",
    answerHint:
      "Aceptar emite el cobro y, si es un trabajo, lo pone en marcha sin consumir tu bolsa de cambios. Rechazar no cuesta nada.",
    acceptSubmit: "Aceptar el presupuesto",
    acceptPending: "Aceptando…",
    acceptDone: "Presupuesto aceptado.",
    rejectReasonLabel: "Motivo (opcional)",
    rejectSubmit: "Rechazar",
    rejectPending: "Rechazando…",
    rejectDone: "Presupuesto rechazado.",
    onlyOwnerTitle: "Solo el propietario responde",
    onlyOwnerReason:
      "Un presupuesto compromete dinero del restaurante: lo acepta o rechaza el propietario local o el del grupo, como las condiciones. Si ya lo habéis contestado fuera de Cuotly, el equipo puede registrarlo en vuestro nombre.",
    decidedByTeamHint: (reason: string) =>
      `Respuesta registrada por el equipo en nombre del restaurante: ${reason}. Si no es correcto, avisa al equipo por mensajes.`,
    pendingPaymentHint: "Aceptado. El cobro está en tu facturación.",
    paidHint: "Pagado.",
    rejectedHint: "Rechazado.",
  },

  /**
   * Fase 3 · Hito 15 · oportunidades por reglas deterministas (§96 a
   * §101; umbrales, impacto y esfuerzo de la decisión 26).
   *
   * El título y la acción recomendada de una oportunidad automática se
   * escriben AQUÍ y no se guardan en la base: la base guarda la regla, el
   * sujeto y las cifras. Es lo que manda CLAUDE.md —nada de literales de
   * interfaz fuera del sistema de i18n— y además evita que una
   * oportunidad detectada hace dos meses siga diciendo una frase que
   * después se corrigió.
   */
  opportunities: {
    title: "Oportunidades",
    teamHint:
      "Detectadas por reglas sobre los datos de las fuentes conectadas, sin IA. El restaurante no ve ninguna hasta que alguien la aprueba.",
    clientHint: "Mejoras que Cuotly ha detectado en los datos de tu restaurante.",

    // El título de cada regla. Lleva el sujeto cuando la regla habla de
    // una consulta concreta: "CTR bajo en «menú del día»".
    ruleTitles: {
      traffic_drop: () => "Descenso de tráfico",
      low_ctr: (subject: string) => `Nadie entra desde «${subject}»`,
      position_loss: (subject: string) => `Pérdida de posición en «${subject}»`,
      slowness: () => "La web va lenta en el móvil",
      heavy_images: () => "Las imágenes pesan de más",
      technical_error: () => "Hay errores técnicos en la web",
      low_mobile_conversion: () => "En el móvil casi nadie termina",
      queries_without_content: (subject: string) => `«${subject}» sale muy abajo en Google`,
      low_button_use: (subject: string) =>
        subject === "friction"
          ? "Se pulsa algo que no responde"
          : "La ficha de Google se ve y no se usa",
    },

    // Qué significa cada una, en una frase, y qué se propone hacer. La
    // acción recomendada es una propuesta: el equipo la puede reescribir.
    ruleExplanations: {
      traffic_drop: "Las visitas han caído respecto a los 28 días anteriores.",
      low_ctr: "La consulta está en la primera página de Google y casi nadie entra: el problema suele ser el título o la descripción.",
      position_loss: "La consulta ha bajado varios puestos y ya no está en la primera página.",
      slowness: "La puntuación de rendimiento en móvil está en la banda roja, o la página tarda más de cuatro segundos en pintar lo principal.",
      heavy_images: "PageSpeed calcula que se ahorraría medio megabyte o más comprimiendo las imágenes o sirviéndolas al tamaño en que se ven.",
      technical_error: "Una parte de las sesiones tiene errores de script. Un error puede romper el formulario o la reserva.",
      low_mobile_conversion: "El móvil convierte la mitad o menos que el escritorio, con suficientes sesiones para que no sea casualidad.",
      queries_without_content: "Google enseña el sitio para esa búsqueda, pero muy abajo. Detecta que sale abajo, no que el contenido sea malo: Cuotly no lee la web.",
      low_button_use: "Las acciones sobre la ficha de Google (web, llamada, cómo llegar) son muy pocas para las veces que se ve, o hay clics que no responden.",
    },

    ruleActions: {
      traffic_drop: "Revisar qué cambió en el periodo y recuperar lo que se perdió.",
      low_ctr: "Reescribir el título y la descripción de la página que responde a esa búsqueda.",
      position_loss: "Revisar el contenido de esa página y lo que ha cambiado desde el periodo anterior.",
      slowness: "Optimizar la carga: imágenes, scripts y lo que bloquea el pintado.",
      heavy_images: "Comprimir y redimensionar las imágenes de la web.",
      technical_error: "Localizar y corregir el error de script.",
      low_mobile_conversion: "Revisar el formulario y la reserva en móvil, de principio a fin.",
      queries_without_content: "Crear o mejorar el contenido que responde a esa búsqueda.",
      low_button_use: "Completar la ficha de Google y revisar que los botones de la web respondan.",
    },

    categories: {
      traffic: "Tráfico",
      search: "Búsqueda",
      performance: "Rendimiento",
      technical: "Técnico",
      conversion: "Conversión",
    },

    // §98 · los ocho estados.
    states: {
      detected: "Detectada",
      recommended: "Recomendada",
      under_review: "En revisión",
      approved_for_report: "Aprobada para informe",
      discarded: "Descartada",
      in_progress: "En ejecución",
      implemented: "Implementada",
      no_longer_applicable: "Ya no aplicable",
    },

    // Decisión 26a · qué significa cada nivel de impacto, dicho entero:
    // sin la explicación, "alto" es una etiqueta sin contenido.
    impacts: { high: "Impacto alto", medium: "Impacto medio", low: "Impacto bajo" },
    impactHints: {
      high: "Afecta al camino por el que un cliente contacta —teléfono, cómo llegar, reserva o formulario— o a más de la mitad del tráfico.",
      medium: "Afecta a una parte visible del sitio o a una entrada de tráfico importante, pero no al camino de contacto.",
      low: "Afecta a una página, una consulta o un detalle suelto.",
    },
    impactNotMoney:
      "El impacto no se dice en euros: Cuotly no sabe lo que vale una reserva ni cuántas visitas acaban en cena, y no va a inventarlo.",

    scopes: { basic: "Básica", advanced: "Avanzada" },
    scopeHint: {
      basic: "Sale de una sola fuente.",
      advanced: "Cruza dos fuentes. Solo la ven los planes que las incluyen.",
    },

    priorityLabel: (n: number) => `Prioridad ${n}`,
    origins: { automatic: "Detectada por Cuotly", manual: "Añadida por el equipo" },

    // Decisión 26b · el esfuerzo ES la categoría del cambio: se dice lo
    // que se tarda y lo que gasta, no "esfuerzo: medio".
    effortTitle: "Esfuerzo estimado",
    effortDuration: {
      small: "1 a 3 días laborables",
      photo: "1 a 3 días laborables",
      medium: "1 a 3 días laborables",
      large: "3 a 5 días laborables",
    },
    effortSpends: (categoria: string, quedan: number) =>
      `Gasta 1 cambio ${categoria.toLowerCase()} de los ${quedan} que te quedan este mes.`,
    effortNotIncluded:
      "Tu plan no incluye este tipo de cambio, o la bolsa de este mes está agotada: iría a presupuesto.",
    effortUnknownBalance: "No se ha podido leer el saldo del ciclo, así que no se dice cuánto queda.",
    effortNone: "Sin esfuerzo propuesto todavía.",

    // La evidencia (§96: "no debe afirmarse algo sin evidencia suficiente").
    evidenceTitle: "Evidencia",
    evidenceHint: "Las cifras que dispararon la regla. No se editan.",
    evidenceMetricColumn: "Métrica",
    evidenceValueColumn: "En la ventana",
    evidencePreviousColumn: "28 días anteriores",
    evidenceNoPrevious: "—",
    period: (desde: string, hasta: string) => `Periodo: ${desde} a ${hasta}`,
    detectedTimes: (n: number) =>
      n === 1 ? "Detectada una vez." : `Detectada ${n} veces; se actualiza, no se duplica.`,
    reopenedAfterDiscard: (motivo: string) =>
      `Estuvo descartada («${motivo}») y ha vuelto a cumplirse.`,

    // Acciones del equipo (§97, §98).
    recommend: "Recomendar",
    review: "Pasar a revisión",
    approve: "Aprobar para informe",
    discard: "Descartar",
    markInProgress: "Marcar en ejecución",
    markImplemented: "Marcar implementada",
    markNotApplicable: "Ya no aplicable",
    reasonLabel: "Motivo",
    discardReasonRequired: "Descartar una oportunidad exige un motivo: queda en el historial.",
    cannotApproveHint:
      "Recomendar sí, aprobar no: aprobar o descartar es del propietario y de los administradores con «Aprobar informes» (§97).",
    includeInReport: "Incluir en informe",
    includedInReport: "Se incluirá en el informe",
    notIncludedInReport: "No se incluye en el informe",

    editTitle: "Editar la propuesta",
    editHint: "Impacto, prioridad, esfuerzo y acción recomendada son propuestas: cámbialas antes de enseñárselas al restaurante. La evidencia no se toca.",
    impactLabel: "Impacto",
    priorityField: "Prioridad (1 es lo primero)",
    effortLabel: "Esfuerzo (categoría del cambio)",
    recommendedActionLabel: "Acción recomendada",
    save: "Guardar la propuesta",
    saving: "Guardando…",

    addTitle: "Añadir oportunidad",
    addHint: "Lo que el equipo ve y las reglas no: una foto vieja, una carta desactualizada, un dato que falta.",
    titleLabel: "Título",
    titleRequired: "Una oportunidad añadida a mano necesita título.",
    descriptionLabel: "Descripción",
    categoryLabel: "Categoría",
    add: "Añadir",
    adding: "Añadiendo…",

    notesTitle: "Evidencia y observaciones del equipo",
    notesHint: "Interno: el restaurante no lo ve.",
    noteKinds: { evidence: "Evidencia", observation: "Observación" },
    noteLabel: "Añadir una nota",
    noteRequired: "La nota no puede estar vacía.",
    addNote: "Añadir nota",

    // §100 · lo que el restaurante puede hacer.
    clientActionsTitle: "¿Qué quieres hacer?",
    clientActions: {
      request_change: "Solicitar esta mejora",
      request_quote: "Pedir presupuesto",
      ask_question: "Hacer una pregunta al equipo",
    },
    clientActionHint:
      "Se crea un borrador de solicitud con esta oportunidad enganchada. No se envía ni gasta nada hasta que tú lo envíes.",
    messageLabel: "Cuéntaselo al equipo",
    messageRequired: "Escribe lo que quieres pedir.",
    messagePrefill: (titulo: string) => `Sobre la oportunidad «${titulo}»: `,
    send: "Crear el borrador",
    sending: "Creando…",
    draftCreated: "Borrador creado. Está en tus solicitudes, listo para enviar.",

    // §101 · por qué un restaurante no ve ninguna.
    clientEmptyNone:
      "Tu plan no incluye las oportunidades detectadas sobre tus datos. El equipo las sigue viendo y puede contártelas.",
    clientEmptyBasic:
      "No hay ninguna oportunidad aprobada ahora mismo. Cuando el equipo apruebe una, aparecerá aquí.",
    teamEmpty: "Ninguna regla ha saltado con los datos de este restaurante.",
    teamEmptyHint:
      "Las reglas se pasan una vez al día sobre las fuentes conectadas y con dato actual. Una fuente desconectada o desactualizada no dispara ninguna.",
    clientVisibilityNote: (visible: boolean) =>
      visible
        ? "El restaurante ve esta oportunidad."
        : "El restaurante NO ve esta oportunidad todavía.",
    clientPlanNote: {
      none: "El plan de este restaurante no incluye ver oportunidades (§101).",
      basic: "Su plan le deja ver las oportunidades básicas aprobadas.",
      advanced: "Su plan le deja ver también las avanzadas.",
    },
  },

  /**
   * Fase 4, Hito 19 · el formulario con el que alguien recién registrado
   * pide su espacio y ve en qué estado está (PRD §30 y §32, RN-ADM-05).
   */
  spaceRequestForm: {
    title: "Pide tu espacio de mantenimiento",
    subtitle:
      "Cuotly revisa cada solicitud a mano. Cuando la acepte, tu espacio se crea con una prueba de 7 días y tú como propietario.",
    back: "Volver",
    statusTitle: "Tu solicitud",
    statusLabel: "Estado",
    reasonLabel: "Lo que dice Cuotly",
    submittedAt: "Enviada el",
    decidedAt: "Decidida el",
    goToSpace: "Entrar en tu espacio",
    approvedHint: "Tu espacio ya existe. Entra y empieza a configurarlo.",
    rejectedHint: "Puedes enviar otra solicitud cuando quieras.",
    needsInfoHint: "Corrige lo que falta y vuelve a enviarla.",
    pendingHint: "Está en manos de Cuotly. Aquí verás la respuesta.",
    states: {
      draft: "Borrador",
      submitted: "Enviada",
      in_review: "En revisión",
      needs_information: "Necesita información",
      approved: "Aprobada",
      rejected: "Rechazada",
    },
    formTitle: "Los datos de tu negocio",
    formHint: "Para enviarla bastan el nombre del negocio, la persona responsable y un correo. El resto ayuda a revisarla antes.",
    businessName: "Nombre del negocio",
    contactName: "Persona responsable",
    email: "Correo de contacto",
    phone: "Teléfono",
    estimatedEstablishments: "Restaurantes que vas a gestionar (estimación)",
    estimatedUsers: "Personas de tu equipo (estimación)",
    intendedUse: "Para qué vas a usar Cuotly",
    plan: "Plan",
    planPro: "Pro · 149 € + IVA al mes · 5 restaurantes activos y 5 personas incluidas",
    planAgency: "Agency · 499 € + IVA al mes · sin límite bajo uso razonable",
    taxTitle: "Datos fiscales básicos",
    taxHint: "Se guardan tal cual los escribes. La validación fiscal y la numeración de facturas llegan con el bloque legal.",
    taxName: "Razón social",
    taxId: "Identificador fiscal",
    taxAddress: "Dirección fiscal",
    saveDraft: "Guardar borrador",
    submit: "Enviar la solicitud",
    pending: "Guardando…",
    savedDraft: "Borrador guardado.",
    submitted: "Solicitud enviada. Cuotly la revisará.",
    validation: "Rellena el nombre del negocio, la persona responsable y el correo.",
    invalidPlan: "Elige Pro o Agency.",
    errorTitle: "No se ha podido cargar tu solicitud",
    onlyOneHint: "Ya tienes una solicitud en marcha: se enseña esa.",
  },

  /**
   * Fase 4, Hito 19 · el panel de Administración de Cuotly (PRD §32,
   * RN-ADM-01 a 04, §128).
   */
  /**
   * RN-ACC-04 · los cinco correos de la puerta de entrada (migración 97).
   * Van a direcciones que todavía no son de nadie, así que no pueden
   * apoyarse en ninguna pantalla: el texto se basta solo y los enlaces son
   * absolutos.
   */
  /**
   * PRD §36 (RN-GLO) · el contexto global: la zona de Cuotly que una
   * persona ve por lo que ES —su cuenta— y no por dónde está.
   */
  globalContext: {
    nav: {
      home: "Inicio",
      requests: "Mis solicitudes",
      messages: "Mensajes",
      account: "Mi cuenta",
      help: "Ayuda",
    },
    home: {
      // §8 y RN-ADM-01 · la entrada a Administración de Cuotly, que vivía en
      // el selector de contexto hasta que el Inicio global ocupó su sitio
      // (decisión 42). Es el mismo texto: lo que cambió es dónde se lee.
      platformTitle: "Administración de Cuotly",
      platformSubtitle: "El panel de la plataforma: usuarios, espacios, solicitudes, cobros y soporte.",
      platformNeedsTwoFactor: "Para entrar en la administración hace falta la verificación en dos pasos.",
      title: "Inicio",
      subtitle: "Lo que tienes entre manos, en todos tus contextos a la vez.",
      attentionTitle: "Necesita tu atención",
      attentionEmpty: "No tienes nada pendiente",
      attentionEmptyReason:
        "Ni trabajos con el plazo en riesgo, ni solicitudes esperándote, ni cobros abiertos. Cuando aparezca algo, estará aquí.",
      attentionFailed: "No hemos podido reunir todo",
      attentionFailedReason:
        "Falta al menos un contexto por leer, así que esta lista puede estar incompleta. Vuelve a cargar en un momento.",
      allContexts: "Todos",
      overdue: "Fuera de plazo",
      dueOn: "Vence el",
      since: "Desde el",
      noDate: "Sin fecha de entrada",
      spacesTitle: "Mis espacios de mantenimiento",
      restaurantsTitle: "Mis paneles de restaurante",
      contextsFailed: "No hemos podido leer tus contextos",
      contextsFailedReason:
        "Es un problema nuestro o de tu conexión, no de tu cuenta. Vuelve a cargar en un momento.",
      noneTitle: "Todavía no tienes ningún contexto",
      noneReason:
        "Tu cuenta existe, pero aún no perteneces a ningún espacio de mantenimiento ni tienes acceso a ningún restaurante. Si has pedido un espacio, abajo verás en qué estado está; si te van a invitar, te llegará por correo.",
      requestSpace: "Solicitar un espacio",
      unreadTitle: "Mensajes sin leer",
      unreadNone: "Nada sin leer",
      openMessages: "Ir a la bandeja",
      requestsTitle: "Mis solicitudes de espacio",
      openRequests: "Ver todas",
      /** RN-GLO-04 · esta pantalla NO es donde viven las de trabajo. */
      requestsElsewhere:
        "Las solicitudes de trabajo viven dentro de cada espacio o de cada panel de restaurante, no aquí.",
      // Página 1 del diseño definitivo móvil · el saludo, el buscador y los
      // botones de entrar. El diseño pone "Hola, Bosco" con el nombre de
      // quien entra; si no lo sabemos, se saluda sin nombre en vez de
      // escribir uno inventado (CLAUDE.md).
      greeting: (nombre: string) => (nombre === "" ? "Hola" : `Hola, ${nombre}`),
      chooseContext: "Elige el espacio o panel al que quieres acceder.",
      searchPlaceholder: "Buscar...",
      attentionCount: (n: number) =>
        n === 1
          ? "Tienes 1 tarea pendiente en tus contextos."
          : `Tienes ${n} tareas pendientes en tus contextos.`,
      enterSpace: "Entrar al espacio",
      enterPanel: "Entrar al panel",
      seeAll: "Ver todos",
      // "4 restaurantes" bajo el nombre del espacio. Es el número de los que
      // hay en el espacio, no el de los que tú puedes ver.
      spaceRestaurants: (n: number) => (n === 1 ? "1 restaurante" : `${n} restaurantes`),
      spaceRestaurantsUnknown: "Sin contar los restaurantes",
      // En un panel, de qué espacio de mantenimiento depende.
      panelMaintenance: (espacio: string) => `Mantenimiento: ${espacio}`,
      unreadCount: (n: number) =>
        n === 1 ? "Tienes 1 mensaje nuevo de tu equipo." : `Tienes ${n} mensajes nuevos de tu equipo.`,
      openItem: "Abrir",
    },
    requests: {
      title: "Mis solicitudes",
      subtitle: "Las solicitudes de creación de espacio que has enviado.",
      emptyTitle: "No has enviado ninguna solicitud",
      emptyReason: "Cuando pidas un espacio de mantenimiento, aparecerá aquí con su estado.",
      business: "Negocio",
      plan: "Plan",
      status: "Estado",
      updated: "Última novedad",
      action: "Acción",
      /** La acción que toca AHORA en cada estado (RN-GLO-04). */
      actions: {
        draft: "Continuar el borrador",
        submitted: "Esperando respuesta",
        in_review: "En revisión",
        needs_information: "Aportar la información",
        approved: "Ver las instrucciones de pago",
        rejected: "Ver el motivo",
      },
      reviewerHidden: "Quién la revisó no se enseña: eso queda en la auditoría de Cuotly.",
      newRequest: "Solicitar otro espacio",
    },
    messages: {
      title: "Mensajes",
      subtitle: "Tus conversaciones de todas partes, reunidas.",
      tabMaintenance: "Mantenimiento",
      tabRestaurants: "Restaurantes",
      allContexts: "Todos",
      onlyUnread: "Solo sin leer",
      showAll: "Ver todas",
      emptyTitle: "No hay conversaciones",
      emptyReason: "Cuando se abra una en cualquiera de tus contextos, la verás aquí.",
      emptyUnread: "No te queda nada sin leer en esta pestaña.",
      failedTitle: "No hemos podido leer tu bandeja",
      failedReason:
        "Es un problema nuestro o de tu conexión. Vuelve a cargar en un momento; no se ha perdido ningún mensaje.",
      unreadOne: "sin leer",
      readOnly: "Cerrada",
      noMessagesYet: "Todavía sin mensajes",
      /** RN-GLO-05 · reúne, no duplica. */
      sameConversations:
        "Son las mismas conversaciones que ves dentro de cada espacio y de cada panel: aquí están juntas.",
    },
    account: {
      title: "Mi cuenta",
      subtitle: "Tus datos, tu seguridad y tus avisos. Es de la persona, no del espacio.",
      profileTitle: "Perfil",
      givenName: "Nombre",
      familyName: "Apellidos",
      email: "Correo electrónico",
      emailLocked: "El correo es la identidad de tu cuenta y se cambia desde Seguridad.",
      phone: "Teléfono",
      timezone: "Zona horaria para leer las fechas",
      /** CLAUDE.md MUST · la del espacio manda en los cálculos. */
      timezoneHelp:
        "Solo cambia cómo se te enseñan las fechas. Los plazos y los vencimientos se siguen calculando en la zona horaria de cada espacio.",
      timezonePlaceholder: "La del espacio",
      save: "Guardar",
      savePending: "Guardando…",
      saved: "Guardado.",
      nameRequired: "El nombre no puede quedar en blanco.",
      /**
       * RN-GLO-09 · la foto, que llegó el 19/09/2026 con su propio sitio
       * (bucket `avatars`, migración 109). Hasta entonces aquí había un
       * motivo escrito en vez de un hueco.
       */
      photoTitle: "Foto",
      photoHint:
        "Se ve en tu cabecera y donde aparezcas dentro de tus espacios. Quien no comparte espacio contigo no la ve.",
      photoChange: "Cambiar foto",
      photoPending: "Subiendo…",
      photoRemove: "Quitar foto",
      photoSaved: "Foto actualizada.",
      photoNone: "Todavía no tienes foto: se enseña tu inicial.",
      /**
       * El tamaño y los formatos son técnicos, no una regla de producto:
       * los pone el bucket (migración 109) y aquí solo se cuentan.
       */
      photoLimits: "JPG, PNG o WebP, hasta 2 MB.",
      avatarMissing: "Elige una imagen antes de guardar.",
      avatarTooLarge: "Esa imagen pesa más de 2 MB. Prueba con una más pequeña.",
      avatarWrongType: "Solo se admiten imágenes JPG, PNG o WebP.",
      avatarNoSession: "Se ha cerrado tu sesión. Vuelve a entrar e inténtalo otra vez.",
      avatarUploadFailed: "No se ha podido guardar la foto. Vuelve a intentarlo.",
      securityTitle: "Seguridad",
      securityBody: "Contraseña, verificación en dos pasos y sesiones abiertas.",
      securityLink: "Contraseña y verificación",
      sessionsLink: "Mis sesiones",
      verifyLink: "Verificar mi correo",
      closeLink: "Cerrar mi cuenta",
      notificationsTitle: "Avisos",
      notificationsBody:
        "Lo que eliges aquí vale en todos tus contextos, también en los que entres mañana. Dentro de un espacio puedes afinarlo, y lo que decidas allí manda sobre esto.",
      channelInApp: "En Cuotly",
      channelEmail: "Correo",
      channelPush: "Móvil",
      mandatory: "No se puede desactivar",
      mandatoryReason:
        "Seguridad, pérdida de acceso, impagos graves y vencimientos críticos llegan siempre.",
      notificationsFailed: "No hemos podido leer tus avisos",
      notificationsFailedReason: "Vuelve a cargar en un momento; no se ha cambiado nada.",
    },
    help: {
      title: "Ayuda",
      subtitle: "El centro de ayuda de Cuotly, desde fuera de tus espacios.",
      /** RN-GLO-07 · abrir una incidencia necesita un espacio detrás. */
      incidentNeedsSpace:
        "Para abrir una incidencia a Cuotly hace falta entrar desde un espacio: una incidencia es de un espacio y va con su prioridad. Entra en el tuyo y ábrela desde su Ayuda.",
    },
    backToCuotly: "Volver al inicio de Cuotly",
    /**
     * Por qué está cada fila en "Necesita tu atención". Los seis primeros
     * son los del Inicio del espacio, dichos en singular porque aquí cada
     * fila es una cosa y no un recuento; los seis siguientes son los del
     * lado del restaurante (RN-GLO-02).
     */
    kinds: {
      job_out_of_deadline: "Fuera de plazo",
      job_about_to_expire: "A punto de vencer",
      job_pending_assignment: "Por asignar",
      request_pending_validation: "Por validar",
      request_correction_requested: "Corrección pedida",
      job_blocked_by_client: "Esperando al restaurante",
      request_needs_information: "Te piden información",
      request_pending_acceptance: "Esperando tu aceptación",
      quote_to_decide: "Presupuesto por decidir",
      charge_to_pay: "Cobro pendiente",
      menu_to_prepare: "Menú por preparar",
      terms_to_accept: "Condiciones por aceptar",
    },
  },

  platformEmails: {
    received: {
      subject: "Hemos recibido tu solicitud de acceso a Cuotly",
      body: (nombre: string | null, enlace: string) =>
        `${nombre ? `Hola, ${nombre}.` : "Hola."}\n\n` +
        "Hemos recibido tu solicitud de acceso a Cuotly. La revisamos a mano y te " +
        "escribiremos a esta dirección con la respuesta.\n\n" +
        `Puedes consultar cómo va aquí: ${enlace}\n\n` +
        "Guarda este mensaje: ese enlace es el único sitio donde seguirla mientras " +
        "todavía no tienes cuenta.",
    },
    needsInformation: {
      subject: "Necesitamos un dato más sobre tu solicitud de Cuotly",
      body: (nombre: string | null, motivo: string, enlace: string) =>
        `${nombre ? `Hola, ${nombre}.` : "Hola."}\n\n` +
        "Para seguir con tu solicitud necesitamos que nos cuentes esto:\n\n" +
        `${motivo}\n\n` +
        `Puedes contestarnos aquí mismo: ${enlace}`,
    },
    approved: {
      subject: "Ya tienes acceso a Cuotly",
      body: (nombre: string | null, enlace: string) =>
        `${nombre ? `Hola, ${nombre}.` : "Hola."}\n\n` +
        "Hemos aprobado tu acceso a Cuotly. Entra por este enlace y elige tu " +
        `contraseña:\n\n${enlace}\n\n` +
        "El enlace sirve una sola vez y caduca en siete días. No te mandamos ninguna " +
        "contraseña por correo a propósito: la eliges tú ahí y no queda escrita en " +
        "ningún buzón.\n\n" +
        "Entrar no crea todavía ningún espacio de mantenimiento: eso se pide desde " +
        "dentro, cuando ya estés.",
    },
    rejected: {
      subject: "Sobre tu solicitud de acceso a Cuotly",
      body: (nombre: string | null, motivo: string) =>
        `${nombre ? `Hola, ${nombre}.` : "Hola."}\n\n` +
        "Esta vez no hemos podido darte acceso a Cuotly. El motivo:\n\n" +
        `${motivo}\n\n` +
        "Si crees que es un malentendido o cambia algo, puedes volver a escribirnos.",
    },
    alreadyRegistered: {
      subject: "Ya tienes cuenta en Cuotly",
      body: (nombre: string | null, enlace: string) =>
        `${nombre ? `Hola, ${nombre}.` : "Hola."}\n\n` +
        "Alguien ha pedido acceso a Cuotly con esta dirección, y esta dirección ya " +
        "tiene cuenta. No hemos abierto ninguna solicitud nueva.\n\n" +
        `Si has sido tú, entra por aquí: ${enlace}\n\n` +
        "Si no reconoces esta petición, puedes ignorar este mensaje: no se ha " +
        "cambiado nada de tu cuenta.",
    },
  },

  platformAdmin: {
    title: "Administración de Cuotly",
    subtitle: "Los doce bloques de §128. Solo Cuotly, con la sesión verificada en dos pasos.",
    switchSpace: "Cambiar de espacio",
    noAccessTitle: "Este panel es de Cuotly",
    noAccessReason: "Solo el propietario de Cuotly y sus Administradores entran aquí.",
    twoFactorRequiredTitle: "Te falta el segundo paso",
    twoFactorRequiredReason:
      "La administración de Cuotly exige una sesión verificada en dos pasos (§136). Actívala en tu cuenta y vuelve a entrar.",
    twoFactorRequiredAction: "Activar la verificación en dos pasos",
    twoFactorChallengeAction: "Verificar esta sesión",
    loadErrorTitle: "No se ha podido cargar el panel",
    nav: {
      overview: "Resumen",
      users: "Usuarios",
      spaces: "Espacios",
      access: "Solicitudes de acceso",
      requests: "Solicitudes de alta",
      charges: "Cobros e impagos",
      support: "Modo soporte",
      incidents: "Incidencias",
      status: "Estado y festivos",
      audit: "Auditoría",
    },
    blocks: {
      users: "Usuarios",
      spaces: "Espacios",
      space_requests: "Solicitudes de alta",
      subscriptions: "Suscripciones",
      revenue: "Ingresos",
      active_trials: "Pruebas activas",
      nonpayment: "Impagos",
      storage: "Almacenamiento",
      activity: "Actividad",
      incidents: "Incidencias",
      support: "Soporte",
      audit: "Auditoría",
    },
    blockHints: {
      users: "Cuentas registradas en Cuotly.",
      spaces: "Espacios de mantenimiento, en cualquier modo.",
      space_requests: "Pendientes de decidir: enviadas, en revisión o esperando información.",
      subscriptions: "Espacios con suscripción a Cuotly.",
      revenue: "Cobrado este mes según el libro. Una cifra de libro, no una factura.",
      active_trials: "Espacios en su prueba de 7 días.",
      nonpayment: "Cobros vencidos sin pagar.",
      storage: "Lo que ocupan todos los espacios. Se mide, no se limita: al 100 % de lo incluido se presupuesta aparte.",
      activity: "Apuntes de auditoría de todos los espacios en las últimas 24 h.",
      incidents: "Incidencias abiertas a Cuotly que no están cerradas.",
      support: "Sesiones de Modo soporte abiertas ahora mismo.",
      audit: "Apuntes de plataforma: solicitudes, cobros, permisos y soporte.",
    },
    incidentsCritical: (n: number) => `${n} crítica${n === 1 ? "" : "s"}`,
    /** RN-SUB-13 (decisión 38) · espacios al 100 % de lo incluido: presupuestos que preparar. */
    storageOverLimit: (n: number) =>
      n === 0 ? "Ningún espacio ha llegado al 100 % de lo incluido." : `${n} espacio${n === 1 ? "" : "s"} al 100 % de lo incluido: presupuestar aparte`,

    /** §131, RN-SOP-07 · la bandeja de incidencias de Cuotly. */
    incidents: {
      title: "Incidencias",
      subtitle: "Lo que los espacios le abren a Cuotly, por prioridad. Crítica por encima del plan; Agency por encima de Pro.",
      showAll: "Ver también las cerradas",
      showOpen: "Ver solo las que no están cerradas",
      emptyTitle: "No hay incidencias",
      emptyReason: "Ningún espacio ha abierto una incidencia a Cuotly.",
      space: "Espacio",
      kind: "Tipo",
      category: "Tema",
      priority: "Prioridad",
      status: "Estado",
      openedAt: "Abierta",
      openedBy: "Abierta por",
      attention: "Atención",
      firstResponse: (m: number | null) => (m === null ? "—" : `${m} min hasta la primera respuesta`),
      resolution: (m: number | null) => (m === null ? "—" : `${m} min hasta la resolución`),
      attentionHint: "Minutos dentro del horario humano de §132 (lunes a viernes de 14:00 a 22:00; fines de semana y festivos de 09:00 a 14:30 y de 16:30 a 21:30). No es un plazo prometido: §131 dice que no lo hay.",
      messages: (n: number) => `${n} mensaje${n === 1 ? "" : "s"}`,
      attachments: (n: number) => `${n} adjunto${n === 1 ? "" : "s"}`,
      detailTitle: "Incidencia",
      description: "Descripción",
      device: "Dispositivo",
      appVersion: "Versión",
      clientContext: "Contexto técnico recogido",
      clientContextEmpty: "No se recogió contexto técnico.",
      helpQuery: "Nació de una búsqueda sin solución",
      statusReason: "Motivo del estado",
      thread: "Conversación",
      threadEmpty: "Todavía no hay mensajes.",
      sideSpace: "El espacio",
      sidePlatform: "Cuotly",
      reply: "Contestar",
      replyLabel: "Mensaje al espacio",
      replySubmit: "Enviar",
      replyDone: "Mensaje enviado.",
      moveTitle: "Cambiar el estado",
      reasonLabel: "Motivo (obligatorio al pedir información o al cerrar sin resolver)",
      moved: "Estado cambiado.",
      finalHint: "Cerrada: no admite más mensajes ni cambios.",
      attachmentsTitle: "Adjuntos",
      attachmentsEmpty: "Sin adjuntos.",
      download: "Descargar",
      backToList: "Volver a la bandeja",
      openSpace: "Abrir el espacio",
    },

    /** §133, §157, RN-SOP-12/13 · la página de estado y los festivos de Cuotly. */
    status: {
      title: "Estado y festivos",
      subtitle: "Lo que Cuotly declara sobre sus cinco componentes, y los festivos del horario humano de §132.",
      publicLink: "Ver la página pública de estado",
      declareTitle: "Declarar un evento",
      declareHint: "Lo declarado manda sobre lo medido en la página pública. Resuélvelo cuando termine: pasa al historial.",
      component: "Componente",
      severity: "Gravedad",
      eventTitle: "Título",
      eventBody: "Detalle (opcional)",
      declareSubmit: "Declarar",
      declared: "Evento declarado.",
      openTitle: "Eventos abiertos",
      openEmpty: "No hay ningún evento abierto: nada declarado ahora mismo.",
      resolveNote: "Nota de resolución (opcional)",
      resolveSubmit: "Marcar como resuelto",
      resolved: "Evento resuelto.",
      historyTitle: "Historial",
      historyEmpty: "Todavía no hay eventos resueltos.",
      holidaysTitle: "Festivos de Cuotly",
      holidaysHint: "Los días en que el horario humano usa el horario de fin de semana. La lista nace vacía: hasta que la rellenes, no hay festivos.",
      holidaysEmpty: "Sin festivos configurados.",
      holidayDate: "Fecha",
      holidayName: "Nombre",
      holidayAdd: "Añadir festivo",
      holidayAdded: "Festivo añadido.",
      holidayRetire: "Retirar",
      holidayRetireReason: "Motivo para retirarlo",
      holidayRetired: "Festivo retirado.",
      retiredLabel: "retirado",
      /** RN-ADM-13 (§142, decisión 38) · declarar un incidente de seguridad. */
      securityTitle: "Declarar un incidente de seguridad",
      securityHint:
        "Un evento de estado marcado como de seguridad, y un aviso obligatorio a los propietarios de los espacios afectados: todos si no se dice cuáles. El texto lo escribes tú; la plantilla legal llegará con el bloque legal.",
      securityAffected: "Espacios afectados (opcional)",
      securityAffectedHint: "Los slugs de los espacios afectados, uno por línea. Vacío: todos los espacios.",
      securitySubmit: "Declarar el incidente y avisar",
      securityDeclared: "Incidente declarado. Los propietarios afectados tienen el aviso.",
      securityBadge: "Incidente de seguridad",
      unknownSlug: (slug: string) => `No existe ningún espacio con el slug «${slug}»`,
    },
    declaredPending: (n: number) => `${n} pago${n === 1 ? "" : "s"} declarado${n === 1 ? "" : "s"} pendiente${n === 1 ? "" : "s"} de confirmar`,
    overdueAmount: "vencidos",
    unitsSpaces: "espacios",
    unitsGb: "GB",

    users: {
      title: "Usuarios",
      subtitle: "Cada cuenta de Cuotly, a qué espacios pertenece y si tiene la verificación en dos pasos.",
      email: "Correo",
      name: "Nombre",
      spaces: "Espacios",
      role: "En Cuotly",
      twoFactor: "2FA",
      twoFactorYes: "Activada",
      twoFactorNo: "Sin activar",
      owner: "Propietario de Cuotly",
      admin: "Administrador de Cuotly",
      nobody: "—",
      createdAt: "Alta",
      manageTitle: "Nombrar Administrador de Cuotly",
      manageHint:
        "Solo el propietario de Cuotly (§167). Cada permiso se concede por separado y todo cambio queda en la auditoría de plataforma. Sin 2FA activada, la persona no podrá actuar aunque tenga el permiso.",
      canApproveSpaces: "Aprobar espacios",
      canManageSubscriptions: "Gestionar suscripciones",
      canSupport: "Modo soporte",
      save: "Guardar permisos",
      revoke: "Retirar el rol",
      pending: "Guardando…",
      saved: "Permisos guardados.",
      revoked: "Rol retirado.",
      notOwnerHint: "Nombrar y retirar Administradores es del propietario de Cuotly.",
      emptyTitle: "No hay usuarios",
      emptyReason: "Todavía no se ha registrado nadie.",
    },

    spaces: {
      title: "Espacios",
      subtitle: "Modo, plan, uso, almacenamiento y deuda de cada espacio. Desde aquí se abre Modo soporte.",
      name: "Espacio",
      status: "Modo",
      plan: "Plan",
      owners: "Propietarios",
      usage: "Uso",
      usageValue: (est: number, users: number) => `${est} rest. · ${users} pers.`,
      storage: "Almacenamiento",
      storageOf: (used: string, included: string) => `${used} de ${included} GB`,
      storageNoLimit: "Sin plan de Cuotly: nada que vigilar.",
      storageAt80: "Al 80 %",
      storageAt100: "Al 100 %: presupuestar aparte",
      debt: "Deuda",
      period: "Periodo hasta",
      trialEnds: "Prueba hasta",
      reactivateBy: "Reactivable hasta",
      noPlan: "Sin suscripción",
      noPlanHint: "Anterior al Hito 17: Cuotly no se cobra a sí misma.",
      statuses: {
        trial: "En prueba",
        active: "Activo",
        archived_trial_ended: "Archivado · prueba sin pago",
        archived_nonpayment: "Archivado · impago",
        archived_by_owner: "Archivado por su propietario",
      },
      supportActive: "Soporte abierto",
      declaredPending: "Pago declarado",
      actions: "Acciones",
      openSupport: "Modo soporte",
      reactivate: "Reactivar",
      reactivateReason: "Motivo de la reactivación",
      reactivatePending: "Reactivando…",
      reactivated: "Espacio reactivado.",
      emptyTitle: "No hay espacios",
      emptyReason: "Todavía no se ha aprobado ninguna solicitud.",
    },

    // PRD §37 (RN-ACC) · la puerta de entrada, que no es la solicitud de
    // creación de espacio y no debe confundirse con ella.
    access: {
      title: "Solicitudes de acceso",
      subtitle:
        "Quién pide entrar en Cuotly (§37). Aprobar crea la cuenta y nada más: ni espacio, ni panel, ni suscripción.",
      business: "Negocio",
      contact: "Quién escribe",
      phone: "Teléfono",
      email: "Correo",
      status: "Estado",
      createdAt: "Enviada",
      open: "Revisar",
      emptyTitle: "No hay solicitudes de acceso",
      emptyReason: "Cuando alguien pida entrar, aparecerá aquí.",
      detailTitle: "Solicitud de acceso",
      back: "Volver a las solicitudes de acceso",
      fields: "Lo que ha escrito",
      comments: "Comentarios",
      applicantReply: "Lo que contestó después",
      decisionTitle: "Decidir",
      decisionHint:
        "Aprobar crea la cuenta y le manda por correo un enlace de un solo uso para poner su contraseña; la contraseña no viaja por correo. No crea espacio ni panel: eso sigue siendo una solicitud de creación de espacio. Pedir información y no aprobar exigen un motivo que el solicitante va a leer.",
      needsInformation: "Pedir información",
      reject: "No aprobar",
      approve: "Aprobar y crear la cuenta",
      reasonLabel: "Motivo (lo lee el solicitante)",
      reasonRequired: "Escribe qué falta o por qué no se aprueba.",
      pending: "Guardando…",
      decided: "Decisión registrada.",
      approved: "Cuenta aprobada. Le hemos enviado el enlace para poner su contraseña.",
      finalHint: "Esta solicitud ya está decidida y no se mueve más.",
      noPermissionHint: "Decidir sobre solicitudes exige el permiso «Aprobar espacios» (§167).",
      requesterHidden:
        "Quién la revisó no se enseña al solicitante: está en la auditoría de plataforma.",
      accountCreated: "Cuenta creada",
      accountPending: "Aprobada. Todavía no ha puesto su contraseña.",
      states: {
        submitted: "En revisión",
        needs_information: "Esperando información",
        approved: "Aprobada",
        rejected: "No aprobada",
      },
    },
    requests: {
      title: "Solicitudes de alta",
      subtitle: "Las solicitudes de creación de espacio (§10). Primero las que esperan una decisión.",
      business: "Negocio",
      contact: "Responsable",
      plan: "Plan",
      status: "Estado",
      submittedAt: "Enviada",
      open: "Revisar",
      emptyTitle: "No hay solicitudes",
      emptyReason: "Cuando alguien pida un espacio, aparecerá aquí.",
      detailTitle: "Solicitud de espacio",
      back: "Volver a las solicitudes",
      fields: "Lo que ha escrito",
      decisionTitle: "Decidir",
      decisionHint:
        "Aprobar crea el espacio, hace propietario al solicitante y arranca la prueba de 7 días; pulsarlo dos veces no crea dos espacios. Rechazar y pedir información exigen un motivo que el solicitante va a leer.",
      review: "Marcar en revisión",
      needsInformation: "Pedir información",
      reject: "Rechazar",
      approve: "Aprobar y crear el espacio",
      reasonLabel: "Motivo (lo lee el solicitante)",
      reasonRequired: "Escribe qué falta o por qué se rechaza.",
      pending: "Guardando…",
      decided: "Decisión registrada.",
      approved: "Espacio creado. La prueba de 7 días ha empezado.",
      finalHint: "Esta solicitud ya está decidida y no se mueve más.",
      noPermissionHint: "Decidir sobre solicitudes exige el permiso «Aprobar espacios» (§167).",
      createdSpace: "Espacio creado",
      requesterHidden: "Quién la revisó no se enseña al solicitante: está en la auditoría de plataforma.",
      /** RN-PLA-09 (decisión 38) · con qué solicitud ya aprobada choca esta. */
      conflictsTitle: "Prueba gratuita: ¿ya la tuvo?",
      conflictsHint:
        "Una sola prueba gratuita por persona o negocio (§4.4). Un negocio es el mismo NIF o el mismo dominio de correo propio; los dominios públicos (Gmail, Hotmail…) no identifican a nadie. Aprobar con un choque falla en el servidor.",
      conflictsNone: "No choca con ninguna solicitud aprobada.",
      conflictsUnavailable: "No se ha podido comprobar: el servidor no ha respondido.",
      conflictKinds: {
        person: "La misma persona",
        tax_id: "El mismo NIF",
        email_domain: "El mismo dominio de correo",
      },
      conflictWith: (matched: string | null, business: string) => `${matched ? `${matched} · ` : ""}solicitud aprobada «${business}»`,
    },

    charges: {
      title: "Cobros e impagos",
      subtitle: "Lo que cada espacio debe a Cuotly, lo que ha declarado y lo cobrado por mes según el libro.",
      pendingTitle: "Pagos declarados pendientes de confirmar",
      pendingHint: "El propietario dice que ha pagado. Confirmar lo apunta en el libro y reactiva el espacio si estaba archivado y no queda deuda vencida; rechazar exige motivo.",
      space: "Espacio",
      reference: "Referencia",
      concept: "Concepto",
      amount: "Importe",
      outstanding: "Pendiente",
      due: "Vence",
      status: "Estado",
      statuses: {
        pending: "Pendiente",
        declared: "Declarado",
        paid: "Pagado",
        overdue: "Vencido",
      },
      method: "Método",
      methods: { transfer: "Transferencia", bizum: "Bizum" },
      paidAt: "Fecha del pago",
      declaredBy: "Declarado por",
      declaredSide: { owner: "el propietario", platform: "Cuotly" },
      receipt: "Justificante",
      note: "Nota",
      confirm: "Confirmar",
      reject: "Rechazar",
      rejectReason: "Motivo del rechazo",
      confirmNote: "Nota (opcional)",
      pending_: "Guardando…",
      confirmed: "Pago confirmado y apuntado en el libro.",
      rejected: "Pago rechazado.",
      openTitle: "Cobros con deuda viva",
      openHint: "Emitidos y no pagados del todo. Si ves el ingreso en el banco sin declaración previa, regístralo aquí.",
      recordTitle: "Registrar un pago visto en el banco",
      recordAmount: "Importe (€)",
      recordMethod: "Método",
      recordPaidAt: "Fecha del pago",
      recordNote: "Nota",
      record: "Registrar",
      recorded: "Pago registrado y confirmado.",
      revenueTitle: "Ingresos por mes",
      revenueHint: "Pagos confirmados menos reversiones, por mes de apunte. Una cifra de libro: la numeración fiscal sigue en el bloque legal.",
      month: "Mes",
      paid: "Cobrado",
      payments: "Pagos",
      emptyPendingTitle: "No hay pagos por confirmar",
      emptyPendingReason: "Ningún espacio ha declarado un pago pendiente.",
      emptyOpenTitle: "No hay cobros con deuda",
      emptyOpenReason: "Todo lo emitido está pagado, o no se ha emitido nada.",
      emptyRevenueTitle: "Sin ingresos todavía",
      emptyRevenueReason: "No hay ningún pago confirmado en el libro.",
      noPermissionHint: "Confirmar, registrar y rechazar pagos exige el permiso «Gestionar suscripciones» (§167).",
      invalidAmount: "Escribe un importe en euros mayor que cero.",
      reasonRequired: "Escribe el motivo.",
    },

    support: {
      title: "Modo soporte",
      subtitle: "Cada entrada de Cuotly en un espacio ajeno: quién, dónde, por qué, con qué nivel, cuánto y qué hizo (§129).",
      space: "Espacio",
      who: "Quién",
      reason: "Motivo",
      level: "Nivel",
      levels: { read: "Solo lectura", admin: "Como administrador", owner: "Como propietario" },
      levelHints: {
        read: "Ver todo lo que ve el equipo. No se puede escribir nada, ni por pantalla ni por función.",
        admin: "Operar como un administrador sin permisos concedidos. Sin configuración del espacio ni equipo.",
        owner: "Operar como el propietario, salvo invitar o añadir personas al equipo.",
      },
      started: "Desde",
      expires: "Hasta",
      ended: "Cerrada",
      active: "Abierta",
      expired: "Caducada",
      actions: "Acciones",
      actionsTitle: "Acciones realizadas",
      actionsEmptyTitle: "Sin acciones",
      actionsEmptyReason: "Esta sesión no ha dejado ningún apunte de auditoría dentro del espacio.",
      enter: "Entrar",
      end: "Cerrar la sesión",
      endNote: "Nota de cierre (opcional)",
      ending: "Cerrando…",
      endedDone: "Sesión cerrada.",
      viewActions: "Ver acciones",
      startTitle: "Abrir Modo soporte",
      startHint:
        "Es la única vía para entrar en un espacio ajeno (§134). El propietario del espacio recibe un aviso que no puede desactivar y ve quién entró en su auditoría.",
      startReason: "Motivo (obligatorio, lo lee el propietario)",
      startLevel: "Nivel de acceso: el mínimo necesario",
      startMinutes: "Duración (minutos, de 15 a 240)",
      start: "Entrar en el espacio",
      starting: "Abriendo…",
      startValidation: "Escribe un motivo y una duración entre 15 y 240 minutos.",
      noPermissionHint: "Abrir Modo soporte exige el permiso «Modo soporte» (§167).",
      emptyTitle: "Ninguna sesión de soporte",
      emptyReason: "Nadie de Cuotly ha entrado todavía en un espacio ajeno.",
      bannerTitle: "Estás en Modo soporte",
      bannerBody: (level: string, minutes: number) => `${level} · quedan ${minutes} min`,
      bannerReadOnly: "Solo lectura: nada de lo que hagas se guardará.",
      bannerLeave: "Salir",
    },

    audit: {
      title: "Auditoría de plataforma",
      subtitle: "Solicitudes, cobros, permisos y soporte. Con «Actividad» se ven los últimos apuntes de todos los espacios.",
      scopePlatform: "Plataforma",
      scopeAll: "Actividad de todos los espacios",
      when: "Cuándo",
      space: "Espacio",
      who: "Quién",
      what: "Qué",
      entity: "Sobre",
      reason: "Motivo",
      inSupport: "En Modo soporte",
      noSpace: "— (plataforma)",
      system: "Sistema",
      emptyTitle: "Sin apuntes",
      emptyReason: "Todavía no hay nada en la auditoría de plataforma.",
      more: "Ver más",
      previous: "Anteriores",
    },
  },

  /**
   * Fase 4, Hito 19 · la verificación en dos pasos (§136, §137, RN-ADM-02).
   */
  twoFactor: {
    title: "Verificación en dos pasos",
    subtitle: "Un código de tu aplicación de autenticación además de la contraseña, cada vez que entras.",
    policy: {
      mandatory: "Obligatoria para ti: sin ella, la administración de Cuotly no responde (§136).",
      recommended: "Muy recomendada para propietarios y administradores de espacio (§136).",
      optional: "Opcional. Protege tu cuenta si la activas.",
    },
    statusOn: "Activada",
    statusOff: "Sin activar",
    sessionVerified: "Esta sesión ya ha pasado el segundo paso.",
    sessionNotVerified: "Esta sesión todavía no ha pasado el segundo paso.",
    verifyNow: "Verificar esta sesión",
    enrollTitle: "Activar",
    enrollHint: "Escanea el código con tu aplicación de autenticación (Google Authenticator, 1Password, Authy…) y escribe el código de seis cifras que te dé.",
    enrollStart: "Empezar a activar",
    enrollStarting: "Preparando…",
    secretLabel: "Si no puedes escanear, escribe esta clave en la aplicación:",
    codeLabel: "Código de seis cifras",
    codePlaceholder: "123456",
    verify: "Confirmar",
    verifying: "Comprobando…",
    enrolled: "Verificación en dos pasos activada.",
    cancel: "Cancelar",
    factorsTitle: "Tus factores",
    factorName: "Aplicación de autenticación",
    factorCreated: "Activado el",
    unenroll: "Desactivar",
    unenrolling: "Desactivando…",
    unenrolled: "Verificación en dos pasos desactivada.",
    unenrollConfirm: "Desactivar la verificación en dos pasos deja tu cuenta solo con la contraseña. Si eres de Cuotly, perderás el acceso a la administración hasta que la vuelvas a activar.",
    unenrollAction: "Sí, desactivar",
    unenrollNeedsAal2: "Para desactivarla, verifica primero esta sesión con un código.",
    invalidCode: "El código no es correcto o ha caducado. Prueba con el siguiente que te dé la aplicación.",
    errorTitle: "No se ha podido cargar la verificación en dos pasos",
    loadError: "Vuelve a cargar la página; si sigue igual, es un problema de conexión con el servidor de identidad.",
    sessionsLink: "Mis sesiones",
    backHome: "Volver al inicio",
    challengeTitle: "Segundo paso",
    challengeSubtitle: "Escribe el código de tu aplicación de autenticación para terminar de entrar.",
    challengeSubmit: "Entrar",
    challengeSignOut: "Salir y entrar con otra cuenta",
    challengeNoFactor: "Esta cuenta no tiene la verificación en dos pasos activada.",
  },

  /**
   * Fase 4, Hito 19 · la suscripción de Cuotly vista por el propietario del
   * espacio (PRD §31 y §32, RN-ADM-10, RN-SUB-06).
   */
  /**
   * §9 · el asistente de puesta en marcha (RN-CIC-01 a 04). Los diez
   * pasos tienen nombre y una frase que dice qué se hace en cada uno: la
   * maestra los enumera en diez palabras sueltas y una lista de diez
   * palabras no es una pantalla.
   */
  onboarding: {
    title: "Puesta en marcha",
    subtitle:
      "Los diez pasos para dejar el espacio listo. No hay prisa y no bloquean nada: el espacio ya funciona entero.",
    noAccessTitle: "Sin acceso a la puesta en marcha",
    noAccessReason:
      "La puesta en marcha del espacio la ve y la completa su propietario.",
    neverBlocks:
      "Se pueden hacer en cualquier orden, y mientras tanto el espacio funciona con normalidad.",
    pendingCount: (n: number) =>
      n === 1 ? "Queda 1 paso por hacer." : `Quedan ${n} pasos por hacer.`,
    completedOn: "Puesta en marcha completada el",
    completedHint:
      "Queda como está: es un hecho con fecha y no se vuelve a abrir aunque algo cambie después.",
    pending: "Pendiente",
    doneByData: "Hecho",
    doneByConfirmation: "Confirmado por el propietario",
    confirmedOn: "Dado por bueno el",
    confirmSubmit: "Doy este paso por bueno",
    confirmPending: "Guardando…",
    unknownStep: "Ese paso no es ninguno de los diez de la puesta en marcha.",
    noAiNote:
      "La puesta en marcha no usa inteligencia artificial: es una secuencia de formularios y tareas pendientes.",
    steps: {
      space_details: {
        title: "Datos del espacio",
        hint: "Razón social, identificador fiscal y dirección. Se copian de la solicitud con la que pediste el espacio, y aquí se corrigen.",
        action: "Ir a Ajustes",
      },
      logo: {
        title: "Logotipo",
        hint: "La imagen que acompaña al nombre del espacio. El resto de la identidad visual no se cambia.",
        action: "Subir el logotipo",
      },
      timezone: {
        title: "Zona horaria",
        hint: "El reloj con el que se cuentan todos los plazos del espacio. Viene puesta en Europa/Madrid: confírmala o cámbiala.",
        action: "Ir a Ajustes",
      },
      working_hours: {
        title: "Horario operativo",
        hint: "Los días y las horas en los que corren los plazos contractuales, y los festivos y cierres del espacio.",
        action: "Ir al calendario",
      },
      taxes: {
        title: "Impuestos",
        hint: "El tipo impositivo con el que se emiten los cobros a los restaurantes. Viene puesto al 21 %.",
        action: "Ir a Ajustes",
      },
      plans_and_services: {
        title: "Planes y servicios",
        hint: "Lo que este espacio le vende a sus restaurantes: al menos un plan de mantenimiento o un servicio.",
        action: "Ir a Planes",
      },
      first_establishment: {
        title: "Primer establecimiento",
        hint: "El primer restaurante al que le das servicio, con su grupo.",
        action: "Dar de alta un restaurante",
      },
      first_worker: {
        title: "Primer trabajador",
        hint: "Quien va a hacer el trabajo. Basta con invitarle: el paso no depende de que conteste.",
        action: "Invitar a alguien",
      },
      notifications: {
        title: "Notificaciones",
        hint: "Qué avisos quieres recibir. De partida están todos activados, salvo los que no se pueden desactivar.",
        action: "Ir a Ajustes",
      },
      security: {
        title: "Seguridad",
        hint: "La verificación en dos pasos de tu cuenta y las sesiones abiertas. Para un propietario de espacio es opcional.",
        action: "Ir a mi seguridad",
      },
    },
  },

  /** §127 · propiedad y fin de un espacio (RN-CIC-05 a 09). */
  spaceOwnership: {
    title: "Propiedad y fin del espacio",
    subtitle:
      "Quién manda en este espacio, y qué pasa cuando deja de hacer falta.",
    noAccessTitle: "Sin acceso a la propiedad del espacio",
    noAccessReason:
      "Transferir la propiedad y archivar el espacio son cosa de su propietario (§127).",
    stateTitle: "Estado del espacio",
    stateUnknown: "Sin suscripción de Cuotly",
    archivedOn: "Archivado el",
    recoverableUntil: "Recuperable hasta el",
    deletionScheduledFor: "Eliminación programada para el",
    roles: { owner: "Propietario", admin: "Administrador", worker: "Trabajador" },

    transferTitle: "Transferir la propiedad",
    transferHint:
      "La propiedad se mueve, no se duplica: quien la recibe pasa a ser propietario y tú te quedas como administrador del espacio. Solo puedes dársela a alguien que ya esté en el equipo.",
    transferTo: "Nuevo propietario",
    transferReason: "Motivo (opcional)",
    transferSubmit: "Transferir la propiedad",
    transferPending: "Transfiriendo…",
    transferDone: "Propiedad transferida. Ahora eres administrador de este espacio.",
    transferValidation: "Elige a quién le transfieres la propiedad.",
    noCandidates:
      "No hay nadie más en el equipo. Invita antes a la persona que va a recibir el espacio.",

    confirmationLabel: (nombre: string) => `Escribe «${nombre}» para confirmar`,
    confirmationMismatch:
      "El nombre escrito no coincide con el del espacio. No se ha hecho nada.",

    archiveTitle: "Archivar el espacio",
    archiveHint:
      "El espacio queda en modo lectura: nadie puede escribir en él, y se conserva entero. Lo puedes recuperar durante 30 días. Pasado ese plazo, recuperarlo deja de estar en tu mano.",
    archiveReason: "Motivo (obligatorio)",
    archiveSubmit: "Archivar el espacio",
    archivePending: "Archivando…",
    archiveDone: "Espacio archivado. Sigue entero y lo puedes recuperar durante 30 días.",
    archiveValidation: "Archivar un espacio exige un motivo escrito.",

    restoreTitle: "Recuperar el espacio",
    restoreHint:
      "Vuelve al modo que tenía y deja de estar en cuenta atrás. Se puede escribir en él otra vez.",
    restoreTooLate:
      "Han pasado los 30 días, así que recuperarlo ya no está en tu mano: escríbenos y lo hacemos nosotros.",
    restoreReason: "Motivo (opcional)",
    restoreSubmit: "Recuperar el espacio",
    restorePending: "Recuperando…",
    restoreDone: "Espacio recuperado.",

    deletionTitle: "Eliminación",
    deletionPending:
      "La fecha de eliminación está programada y guardada, pero **todavía no se elimina nada**: qué se borra de verdad, qué hay que conservar por obligación legal y durante cuánto tiempo está pendiente de la revisión jurídica. Hasta entonces el espacio se conserva entero.",

    exportFirst: "Antes de archivar, puedes llevarte todo:",
    exportLink: "exportar el espacio",
  },

  /** §141, §123 · exportación (RN-CIC-10/11). */
  spaceExport: {
    title: "Exportación y conservación",
    subtitle: "Llévate los datos de este espacio en un archivo.",
    noAccessTitle: "Sin acceso a la exportación",
    noAccessReason: "Exportar el espacio entero es cosa de su propietario (§141).",
    spaceTitle: "Exportar el espacio",
    spaceHint:
      "Un único archivo JSON con lo que hay en este espacio: restaurantes, solicitudes, trabajos, mensajes, finanzas y la auditoría. Se prepara en el servidor y se descarga en tu navegador.",
    clientTitle: "Exportar los datos de este restaurante",
    clientHint:
      "Un único archivo JSON con lo que es de este restaurante: sus solicitudes, sus mensajes, sus archivos y sus cobros.",
    submit: "Descargar la exportación",
    downloadHint:
      "Se prepara en el momento y se descarga como un archivo JSON. Si no se descarga nada, es que no tienes permiso para exportar esto.",
    scopeLabel: "Qué exportar",
    scopes: {
      space: "Espacio completo",
      group: "Grupo de restaurantes",
      establishment: "Un restaurante",
    },
    historyTitle: "Exportaciones anteriores",
    historyEmptyTitle: "Todavía no se ha exportado nada",
    historyEmptyReason: "Cuando alguien exporte, aparecerá aquí con la fecha y el alcance.",
    historyWhen: "Cuándo",
    historyScope: "Alcance",
    historySize: "Contenido",
    historyCounts: (tablas: number, filas: number) =>
      `${tablas} ${tablas === 1 ? "tabla" : "tablas"} · ${filas} ${filas === 1 ? "fila" : "filas"}`,
    retentionTitle: "Conservación",
    retentionPending:
      "Cuánto tiempo se conserva cada cosa y qué hay que guardar por obligación legal está pendiente de la revisión jurídica. Mientras tanto no se borra nada.",
  },

  /** §141 · cerrar la cuenta personal (RN-CIC-12). */
  closeAccount: {
    title: "Cerrar mi cuenta",
    subtitle: "Qué hay que resolver antes, y qué falta por decidir.",
    blockersTitle: "Lo que hay que resolver antes",
    blockersHint:
      "Eres la única persona propietaria de esto. Si cerraras la cuenta se quedaría sin dueño, así que primero hay que darle uno o cerrarlo.",
    noBlockersTitle: "No hay nada que te lo impida",
    noBlockersReason:
      "No eres la única persona propietaria de ningún espacio ni de ningún grupo.",
    kinds: { space: "Espacio de mantenimiento", group: "Grupo de restaurantes" },
    remedies: {
      transfer_ownership:
        "Transfiere la propiedad a alguien del equipo desde los ajustes del espacio.",
      transfer_or_close_group:
        "Pásale el grupo a otra persona, o pide que se cierre, antes de cerrar tu cuenta.",
    },
    deletionTitle: "El cierre en sí",
    deletionPending:
      "Todavía no se puede cerrar la cuenta desde aquí: qué se borra, de qué se guarda una copia sin nombre y qué hay que conservar por obligación legal está pendiente de la revisión jurídica. Preferimos decirlo a poner un botón que no hace lo que promete.",
    backToSecurity: "Volver a la seguridad de mi cuenta",
  },

  cuotlySubscription: {
    title: "Suscripción de Cuotly",
    subtitle: "Lo que este espacio le paga a Cuotly: el modo, el plan, los cobros y cómo declarar un pago.",
    back: "Volver a Ajustes",
    settingsLink: "Ver la suscripción de Cuotly",
    settingsHint: "El plan, los cobros y la declaración de pagos a Cuotly. Solo el propietario.",
    noAccessTitle: "La suscripción es del propietario",
    noAccessReason: "Lo que el espacio le paga a Cuotly solo lo ve y lo gestiona su propietario (§4.2.1).",
    noPlanTitle: "Este espacio no tiene suscripción de Cuotly",
    noPlanReason: "Es anterior a la solicitud de espacio (Hito 17): Cuotly no se cobra a sí misma ni a los espacios de prueba.",
    statusLabel: "Modo del espacio",
    statuses: {
      trial: "En prueba",
      active: "Activo",
      archived_trial_ended: "Archivado en modo lectura: la prueba terminó sin pago",
      archived_nonpayment: "Archivado en modo lectura por impago",
      archived_by_owner: "Archivado en modo lectura por decisión de su propietario",
    },
    planLabel: "Plan",
    plans: { pro: "Pro", agency: "Agency" },
    periodLabel: "Periodo en curso",
    trialEndsLabel: "La prueba termina el",
    reactivationLabel: "Puedes reactivar pagando hasta el",
    pendingPlanLabel: "Cambio programado a",
    extrasLabel: "Adicionales contratados",
    extrasValue: (est: number, users: number) => `${est} restaurante${est === 1 ? "" : "s"} · ${users} usuario${users === 1 ? "" : "s"}`,
    usageLabel: "Uso actual",
    usageValue: (est: number, users: number, gb: string) => `${est} restaurantes activos · ${users} usuarios internos · ${gb} GB`,
    chargesTitle: "Cobros",
    chargesHint: "El estado se calcula en el servidor a partir del libro y del vencimiento. Cuotly emite referencia bancaria, no factura.",
    reference: "Referencia",
    concept: "Concepto",
    period: "Periodo",
    total: "Total",
    outstanding: "Pendiente",
    due: "Vence",
    status: "Estado",
    statusesCharge: { pending: "Pendiente", declared: "Pago declarado", paid: "Pagado", overdue: "Vencido" },
    emptyChargesTitle: "Sin cobros",
    emptyChargesReason: "Cuotly todavía no ha emitido ningún cobro a este espacio.",
    declareTitle: "Declarar un pago",
    declareHint: "Haz la transferencia o el Bizum con la referencia del cobro y decláralo aquí. Cuotly lo confirma a mano; mientras esté pendiente, el espacio no se archiva por ese cobro.",
    declareCharge: "Cobro",
    declareAmount: "Importe pagado (€)",
    declareMethod: "Método",
    declarePaidAt: "Fecha del pago",
    declareReference: "Referencia del banco o de Bizum",
    declareNote: "Nota",
    declare: "Declarar el pago",
    declaring: "Enviando…",
    declared: "Pago declarado. Cuotly lo confirmará.",
    declareValidation: "Elige el cobro, el método y un importe mayor que cero.",
    bankTitle: "Cómo pagar",
    bankHint: "Transferencia o Bizum, con la referencia del cobro en el concepto. No hay pago con tarjeta.",
    paymentsTitle: "Pagos declarados",
    paymentState: { pending: "Pendiente de confirmar", confirmed: "Confirmado", rejected: "Rechazado", reversed: "Revertido" },
    errorTitle: "No se ha podido cargar la suscripción",
  },

  /** §131 · nombres compartidos de una incidencia, a los dos lados. */
  incidents: {
    kinds: { error: "Error", suggestion: "Sugerencia" },
    categories: {
      first_steps: "Primeros pasos",
      requests: "Solicitudes",
      jobs: "Trabajos",
      menus: "Menús",
      payments: "Pagos",
      users: "Usuarios",
      integrations: "Integraciones",
      security: "Seguridad",
      other: "Otro",
    },
    impacts: { low: "Bajo", medium: "Medio", high: "Alto", critical: "Crítico" },
    priorities: { critical: "Crítica", high: "Alta", standard: "Estándar" },
    noPriority: "Sin prioridad",
    states: {
      open: "Abierta",
      in_review: "En revisión",
      needs_information: "Necesita información",
      in_progress: "En proceso",
      resolved: "Resuelta",
      closed: "Cerrada",
    },
    sides: { space: "El espacio", platform: "Cuotly" },
  },

  /** §133, RN-SOP-10/11 · el centro de ayuda y las incidencias, vistos desde el espacio. */
  help: {
    title: "Ayuda",
    subtitle: "Guías por rol y un buscador. Si no encuentras solución, el propietario o un administrador pueden abrir una incidencia a Cuotly.",
    searchLabel: "¿Qué necesitas?",
    searchPlaceholder: "Busca por palabras: logotipo, Bizum, plazo…",
    searchSubmit: "Buscar",
    resultsTitle: (q: string) => `Resultados para «${q}»`,
    noResultsTitle: "Ninguna guía responde a eso",
    noResultsCanOpen: "Puedes abrir una incidencia a Cuotly con esta búsqueda ya dentro: así se conserva el contexto.",
    noResultsCannotOpen: (rol: string) =>
      `Las incidencias a Cuotly las abre el propietario o un administrador de tu espacio de mantenimiento. Como ${rol}, cuéntaselo a ellos${"."}`,
    noResultsClient: "Las incidencias a Cuotly las abre tu equipo de mantenimiento. Escríbeles desde cualquiera de tus solicitudes: te contestan como «Equipo de mantenimiento».",
    openFromSearch: "Abrir una incidencia con esta búsqueda",
    guidesTitle: "Guías para tu rol",
    otherGuidesTitle: "Otras guías",
    forMyRole: "Para tu rol",
    topics: {
      first_steps: "Primeros pasos",
      requests: "Solicitudes",
      jobs: "Trabajos",
      menus: "Menús",
      payments: "Pagos",
      users: "Usuarios",
      integrations: "Integraciones",
      security: "Seguridad",
    },
    hoursTitle: "Horario humano de soporte",
    hoursBody: "Lunes a viernes de 14:00 a 22:00; sábados, domingos y festivos de 09:00 a 14:30 y de 16:30 a 21:30 (hora de Madrid). Puedes escribir a cualquier hora; el tiempo de atención solo cuenta dentro de esas franjas. No hay un plazo de respuesta comprometido.",
    supportOpenNow: "Ahora mismo hay soporte humano.",
    supportClosedNow: "Ahora mismo estás fuera del horario de soporte humano.",
    statusLink: "Ver el estado de Cuotly",
    incidentsLink: "Tus incidencias a Cuotly",
    newIncidentLink: "Abrir una incidencia",

    incidents: {
      title: "Incidencias a Cuotly",
      subtitle: "Errores y sugerencias que este espacio le ha abierto a Cuotly. Las ven el propietario y los administradores.",
      noAccessTitle: "Sin acceso a las incidencias",
      noAccessReason: "Las incidencias a Cuotly las abren y las ven el propietario y los administradores del espacio (§131).",
      emptyTitle: "Sin incidencias",
      emptyReason: "Este espacio no ha abierto ninguna incidencia a Cuotly.",
      errorsTitle: "Errores",
      suggestionsTitle: "Sugerencias",
      openNew: "Abrir una incidencia",
      awaitingYou: "Espera algo de ti",
      detailTitle: "Incidencia",
      backToList: "Volver a las incidencias",
      description: "Descripción",
      status: "Estado",
      priority: "Prioridad",
      openedAt: "Abierta",
      category: "Tema",
      impact: "Impacto",
      kind: "Tipo",
      statusReason: "Cuotly dice",
      thread: "Conversación con Cuotly",
      threadEmpty: "Todavía no hay mensajes. Cuotly te contestará aquí.",
      you: "Tu espacio",
      cuotly: "Cuotly",
      replyLabel: "Escribir a Cuotly",
      replySubmit: "Enviar",
      replyDone: "Mensaje enviado.",
      replyHint: "Si Cuotly te pidió información, contestar aquí devuelve la incidencia a revisión.",
      closedHint: "Cerrada: no admite más mensajes. Si hace falta algo más, abre otra.",
      confirmResolved: "Dar por resuelta y cerrar",
      reopen: "No está resuelta: reabrir",
      reopenReason: "Qué sigue fallando",
      moved: "Estado cambiado.",
      attachmentsTitle: "Adjuntos",
      attachmentsEmpty: "Sin adjuntos.",
      attachLabel: "Adjuntar una captura o un archivo (hasta 25 MB)",
      attachSubmit: "Adjuntar",
      attachDone: "Adjunto añadido.",
      attachMissing: "Elige un archivo.",
      attachWrongType: "Ese formato no se admite: imágenes, PDF, Word, Excel o texto.",
      attachTooBig: "El archivo pasa de 25 MB.",
      attachUploadFailed: "No se ha podido subir el archivo. La incidencia no lo tiene.",
      download: "Descargar",
    },

    newIncident: {
      title: "Abrir una incidencia a Cuotly",
      subtitle: "Para errores de Cuotly y sugerencias. Lo que sea de tu web o de tus restaurantes va por tus solicitudes.",
      kindLabel: "Qué es",
      categoryLabel: "Tema",
      impactLabel: "Impacto",
      impactHint: "Crítico: no puedes trabajar. Una incidencia crítica va por delante del plan.",
      descriptionLabel: "Qué pasa",
      descriptionHint: "Qué hacías, qué esperabas y qué ha ocurrido. Cuanto más concreto, antes.",
      deviceLabel: "Dispositivo (opcional)",
      appVersionLabel: "Versión de la aplicación (opcional)",
      contextTitle: "Lo que se enviará con la incidencia",
      contextHint: "Cuotly recoge navegador, sistema y tamaño de pantalla para reproducir el problema. Nada más: ni datos de tu espacio ni cookies.",
      contextUnavailable: "No se ha podido leer el contexto del navegador; la incidencia irá sin él.",
      fromSearch: (q: string) => `Nace de la búsqueda «${q}», que no encontró solución.`,
      submit: "Abrir la incidencia",
      pending: "Abriendo…",
      validation: "Hace falta el tema y una descripción; y en un error, el impacto.",
    },
  },

  /** §133, §157, RN-SOP-12 · la página pública de estado. */
  statusPage: {
    title: "Estado de Cuotly",
    subtitle: "Cinco componentes. De cada uno se dice si su estado se mide o solo se declara: nada se da por operativo sin comprobarlo.",
    generatedAt: "Actualizado",
    components: {
      app: "Aplicación",
      auth: "Autenticación",
      files: "Archivos",
      notifications: "Notificaciones",
      integrations: "Integraciones",
    },
    states: {
      operational: "Operativo",
      degraded: "Degradado",
      outage: "Caído",
      maintenance: "En mantenimiento",
      unmeasured: "Sin medición automática",
    },
    sourceMeasured: "Medido",
    sourceDeclared: "Declarado por Cuotly",
    securityLabel: "Incidente de seguridad",
    sourceUnmeasured: "Sin medición automática: solo lo que Cuotly declare.",
    measuredDetails: {
      responds: "La aplicación responde.",
      nothingConnected: "No hay integraciones conectadas que medir.",
      deliveries: (dead: number, stuck: number) =>
        `Entregas de correo en 24 h: ${dead} fallida${dead === 1 ? "" : "s"} definitivamente, ${stuck} atascada${stuck === 1 ? "" : "s"} más de una hora.`,
      integrations: (failing: number, connected: number) =>
        `${failing} de ${connected} conexiones con tres o más fallos seguidos.`,
    },
    severities: { degraded: "Degradado", outage: "Caída", maintenance: "Mantenimiento" },
    openTitle: "Ahora mismo",
    openEmpty: "No hay ningún evento declarado.",
    historyTitle: "Historial",
    historyEmpty: "Todavía no hay eventos resueltos.",
    since: "Desde",
    until: "Hasta",
    supportTitle: "Soporte humano",
    supportOpen: "Dentro del horario de soporte humano ahora mismo.",
    supportClosed: "Fuera del horario de soporte humano ahora mismo. Lunes a viernes de 14:00 a 22:00; fines de semana y festivos de 09:00 a 14:30 y de 16:30 a 21:30, hora de Madrid.",
    loadError: "No se ha podido cargar el estado.",
    backToApp: "Volver a Cuotly",
  },

  /**
   * Páginas 152 y 153 del diseño definitivo móvil · "Usuarios y accesos"
   * del panel del restaurante (RN-EST-15/16/17, decisiones 51 y 52).
   *
   * Los nombres de los siete permisos y sus explicaciones salen de la
   * página 153 tal cual: son los que el restaurante lee, y cambiarlos por
   * los nombres de las columnas (`create_requests`…) sería enseñarle el
   * esquema.
   */
  panelUsers: {
    title: "Usuarios y accesos",
    hint: "Gestiona quién puede acceder a tu restaurante en Cuotly y qué permisos tiene.",
    listTitle: "Usuarios del restaurante",
    roleLabel: "Rol",
    emailLabel: "Correo electrónico",
    scopeLabel: "Ámbito",
    permissionsLabel: "Permisos",
    /** El Propietario no se configura: los tiene por su rol (RN-EST-15). */
    ownerAll: "Acceso completo a todos los módulos",
    /** Un Editor recién creado no tiene ninguno: nacen apagados. */
    noneYet: "Sin ningún permiso todavía",
    scopeGroup: "Todos los restaurantes del grupo",
    active: "Activo",
    /**
     * §20.7 · una lista vacía por un error afirmaría que el restaurante no
     * tiene usuarios, y eso, sin haber podido mirar, no lo sabe nadie.
     */
    failed: "No se ha podido cargar quién tiene acceso. Vuelve a intentarlo.",
    permissions: {
      create_requests: "Crear solicitudes",
      edit_menus: "Editar menús",
      use_messages: "Mensajes",
      upload_files: "Subir archivos",
      view_reports: "Consultar informes",
      view_billing: "Pagos y facturas",
      manage_users: "Usuarios y accesos",
    },
    permissionHints: {
      create_requests: "Puede enviar solicitudes al equipo de mantenimiento.",
      edit_menus: "Puede solicitar cambios en el menú diario.",
      use_messages: "Puede leer y enviar mensajes.",
      upload_files: "Puede adjuntar archivos en solicitudes y mensajes.",
      view_reports: "Puede ver los informes y datos del restaurante.",
      view_billing: "Puede ver los pagos y las facturas.",
      manage_users: "Puede gestionar usuarios y permisos.",
    },
    edit: "Editar permisos",
    editTitle: (who: string) => `Permisos de ${who}`,
    save: "Guardar permisos",
    saving: "Guardando…",
    saved: "Permisos guardados.",
    cancel: "Cancelar",
    /**
     * Página 152 · el aviso que el diseño pone bajo la lista. Lo dice la
     * pantalla porque es lo que el restaurante necesita saber; quien lo
     * hace cumplir es `assert_can_manage_access()` en el servidor.
     */
    onlyOwnerTitle: "Solo el propietario puede invitar o retirar usuarios",
    onlyOwnerHint:
      "Por motivos de seguridad, solo el propietario del restaurante puede invitar nuevos usuarios, editar permisos o retirar accesos.",
    ownerNotEditable:
      "Al propietario del restaurante no se le configuran los permisos: los tiene todos por su rol.",
    groupNotEditable:
      "Este acceso viene del grupo, no de este restaurante, así que sus permisos no se cambian desde aquí.",
    /**
     * CLAUDE.md · no se pinta un hueco ni un dato de relleno: se dice qué
     * falta y por qué. La pestaña "Invitar usuario" de la página 153 crea
     * una CUENTA nueva, y eso todavía no existe: hoy solo se puede dar
     * acceso a quien ya tiene cuenta en Cuotly, desde la ficha del equipo.
     */
    inviteTitle: "Invitar usuario",
    inviteNotBuilt:
      "Invitar a alguien que todavía no tiene cuenta en Cuotly no está construido. De momento el acceso lo da el equipo de mantenimiento a quien ya tiene cuenta.",
  },

  emptyReasons: {
    not_connected: "No conectado. Falta enlazar el servicio para ver este dato.",
    no_data_yet: "Sin datos todavía. Aparecerán en cuanto haya actividad.",
    error: "No se ha podido cargar. Vuelve a intentarlo.",
    // §178 · "última sincronización": el dato existe pero es viejo, y se
    // dice en vez de enseñarlo como actual (RN-INT-07).
    stale: "Dato desactualizado. La última sincronización correcta es antigua; se enseña la fecha, no una cifra actual.",
    insufficient_period: "Periodo insuficiente. Hace falta más historial para calcular esto.",
  },

  /**
   * Los mismos cinco motivos de §178, **en una celda**. Las frases de
   * arriba están escritas para un estado vacío de pantalla completa y no
   * caben en una columna de tabla ni en una tarjeta: truncarlas dejaría
   * "Sin datos todavía. Aparecerán en cuanto…", que es peor que decirlo
   * corto. El motivo largo sigue estando donde hay sitio.
   */
  emptyReasonsShort: {
    not_connected: "No conectado",
    no_data_yet: "Sin datos todavía",
    error: "No se ha podido cargar",
    stale: "Dato desactualizado",
    insufficient_period: "Periodo insuficiente",
  },
} as const;

export type Dictionary = typeof es;
