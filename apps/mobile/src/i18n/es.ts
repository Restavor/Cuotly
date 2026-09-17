import { es as esWeb } from "@/i18n/es";

/**
 * RN-MOV-11 · el mismo lenguaje que la web (§179): las entidades, los
 * estados, los destinos y los avisos se nombran con el **mismo catálogo**
 * (`apps/web/src/i18n/es.ts`, importado y reexportado como `web`, no
 * copiado). Aquí solo viven los textos que la web no tiene: la sesión en
 * el teléfono, el push, la biometría, la falta de conexión, los permisos y
 * lo que la app no trae y dice dónde está.
 */
export const web = esWeb;

export const es = {
  /*
   * El bloque `auth` que había aquí se ha ido entero al catálogo de la web
   * (`web.auth.login` y `web.auth.signup`), que es donde manda RN-MOV-11.
   * Eran textos repetidos, y repetidos se quedaron atrás: seguían diciendo
   * "Crear cuenta en Cuotly" y "Regístrate" después de que la decisión 41
   * cerrara el registro abierto (§37).
   */

  /** Lo que le pasa a la sesión **en el teléfono**, que la web no tiene. */
  session: {
    expired:
      "Tu sesión ya no vale. Vuelve a entrar y repite lo que estabas haciendo: no se ha enviado nada.",
  },

  common: {
    back: "Atrás",
    send: "Enviar",
    confirm: "Confirmar",
    saving: "Guardando…",
    sending: "Enviando…",
    done: "Hecho",
    alreadyDone: "Ya estaba hecho.",
    openInWeb: "Abrir en la web",
    signOut: "Cerrar sesión",
    signedInAs: (email: string) => `Has entrado como ${email}.`,
    reload: "Actualizar",
    noSpaces: "Tu cuenta no pertenece todavía a ningún espacio ni a ningún restaurante. Pide una invitación a tu equipo.",
    chooseContext: "¿Dónde quieres entrar?",
    spaces: "Espacios de mantenimiento",
    establishments: "Restaurantes",
    notFound: "No se encuentra, o no tienes acceso.",
    of: "de",
  },

  /** RN-MOV-09 · sin conexión. */
  offline: {
    banner: "Sin conexión. Estás viendo lo último que se cargó.",
    fetchedAt: (when: string) => `Datos de ${when}`,
    buttonReason: "Necesita conexión: no se ha encolado nada.",
    draftsTitle: "Borradores escritos sin conexión",
    draftsHint: "Se envían solo cuando tú lo confirmes, uno a uno.",
    draftRequest: "Solicitud",
    draftMessage: "Mensaje",
    sendDraft: "Enviar ahora",
    discardDraft: "Descartar",
    draftSaved: "Guardado como borrador: se enviará cuando vuelva la conexión y lo confirmes.",
    draftSent: "Borrador enviado.",
    noNetworkToSend: "Sigue sin haber conexión.",
  },

  /** RN-MOV-06 · push (§70). */
  push: {
    explainTitle: "Avisos en el teléfono",
    explainBody:
      "Cuotly puede avisarte aquí cuando llegue una solicitud, cuando un plazo esté cerca o cuando el restaurante conteste. El aviso solo dice qué ha pasado y en qué espacio: el detalle está dentro, con tu sesión.",
    explainAccept: "Activar avisos",
    explainLater: "Ahora no",
    deniedBanner: "Los avisos del teléfono están desactivados. Sigues recibiendo el correo.",
    openSettings: "Activar en Ajustes",
    unavailable: "Este dispositivo no admite avisos push (simulador o sin servicios de Google).",
    notConfigured:
      "La app no tiene proyecto de Expo configurado (app.json → extra.eas.projectId): no se puede obtener el token de push en este dispositivo.",
    status: {
      title: "Avisos en este teléfono",
      granted: "Activados",
      denied: "Desactivados en el sistema",
      unknown: "Sin decidir",
      unavailable: "No disponibles",
      registered: "Este teléfono está registrado para recibirlos.",
      notRegistered: "Este teléfono no está registrado.",
    },
    preferenceLabel: "Push",
    mandatoryHint: "Obligatorio: no se puede desactivar por ningún canal.",
  },

  /** RN-MOV-08 · biometría. */
  lock: {
    title: "Bloqueo con huella o cara",
    hint: "Opcional. Pide desbloquear al volver a la app. No sustituye a la contraseña ni a la verificación en dos pasos.",
    enable: "Activar bloqueo",
    disable: "Desactivar bloqueo",
    notAvailable: "Este dispositivo no tiene huella ni cara configuradas.",
    unlock: "Desbloquear",
    prompt: "Desbloquear Cuotly",
    lockedTitle: "Cuotly está bloqueada",
  },

  /** RN-MOV-07 · permisos, pedidos al usarlos. */
  media: {
    takePhoto: "Hacer una foto",
    pickPhoto: "Elegir de la galería",
    scanDocument: "Fotografiar un documento",
    cameraDenied: "Sin permiso de cámara no se puede hacer la foto. Puedes activarlo en Ajustes.",
    libraryDenied: "Sin permiso de fotos no se puede elegir ninguna. Puedes activarlo en Ajustes.",
    uploading: "Subiendo…",
    uploaded: "Archivo subido.",
    webUrlMissing: "La app no tiene configurada la dirección de la web (EXPO_PUBLIC_WEB_URL): no se pueden subir archivos.",
    uploadFailed: "La subida se ha cortado. Vuelve a intentarlo.",
  },

  /** RN-MOV-03 · lo que la app no trae dice dónde está. */
  notInApp: {
    title: "Esto se hace desde la web",
    body: (what: string) => `${what} no está en la app: se gestiona desde la web de Cuotly, en el ordenador.`,
    adminPanel: "El panel de Administración de Cuotly y Modo soporte son de escritorio.",
  },

  home: {
    team: {
      title: "Inicio",
      pendingRequests: "Solicitudes por validar",
      openJobs: "Trabajos en marcha",
      myJobs: "Mis trabajos",
      myTasks: "Mis tareas abiertas",
      unread: "Conversaciones sin leer",
    },
    client: {
      title: "Tu restaurante",
      openRequests: "Solicitudes abiertas",
      newRequest: "Pedir un cambio",
      allowance: "Tu bolsa del plan",
      remaining: (remaining: number, included: number) => `${remaining} de ${included}`,
    },
  },

  requests: {
    title: "Solicitudes",
    empty: "No hay solicitudes.",
    detail: "Solicitud",
    descriptionLabel: "Qué quieres cambiar",
    contextLabel: "Dónde (página, sección…)",
    create: "Pedir un cambio",
    validateTitle: "Validar la clasificación",
    categoryLabel: "Categoría",
    summaryLabel: "Resumen para el restaurante",
    validate: "Validar y enviar al restaurante",
    moreInfo: "Pedir más información",
    moreInfoLabel: "Qué falta",
    reject: "Rechazar",
    rejectLabel: "Motivo",
    accept: "Aceptar la solicitud",
    acceptHint: "Al aceptar se consume de tu bolsa y el equipo la asigna.",
    correction: "Pedir la corrección gratuita",
    correctionLabel: "Qué hay que corregir",
    correctionClosed: "La ventana de corrección gratuita está cerrada.",
    conversation: "Conversación",
    attach: "Adjuntar una foto",
  },

  jobs: {
    title: "Trabajos",
    mine: "Mis trabajos",
    empty: "No hay trabajos.",
    detail: "Trabajo",
    assign: "Asignar",
    assignTo: "Asignar a",
    candidates: "Candidatos",
    noCandidates: "Nadie cumple los requisitos de este trabajo.",
    start: "Comenzar",
    startBlockedByQuote: "Este trabajo espera el pago del presupuesto antes de empezar.",
    block: "Bloquear",
    blockReason: "Motivo del bloqueo",
    blockNote: "Nota (opcional)",
    unblock: "Desbloquear",
    publish: "Publicar",
    publishHint: "Adjunta antes la evidencia de lo publicado. La ventana de corrección gratuita son 72 horas laborables.",
    evidence: "Evidencia",
    evidenceAttached: "Evidencia adjuntada.",
    correctionWindow: (until: string) => `Corrección gratuita hasta ${until}`,
    startedAt: (when: string) => `Comenzado ${when}`,
    publishedAt: (when: string) => `Publicado ${when}`,
    load: (points: number) => `${points} puntos de carga`,
  },

  tasks: {
    title: "Tareas",
    empty: "No hay tareas.",
    complete: "Marcar como hecha",
    startTask: "Empezar",
    minutes: (m: number) => `${m} min`,
  },

  messages: {
    title: "Mensajes",
    empty: "No hay conversaciones.",
    placeholder: "Escribe un mensaje",
    readOnly: "Esta conversación está en solo lectura.",
    unread: (n: number) => (n === 1 ? "1 sin leer" : `${n} sin leer`),
    you: "Tú",
  },

  finance: {
    title: "Finanzas",
    empty: "No hay cobros.",
    charge: "Cobro",
    outstanding: "Pendiente",
    registerPayment: "Registrar un pago",
    amountLabel: "Importe (euros)",
    methodLabel: "Método",
    noteLabel: "Nota (opcional)",
    paidAtLabel: "Fecha del pago (AAAA-MM-DD)",
    registered: "Pago registrado.",
    amountInvalid: "El importe no es válido.",
    billing: "Facturación",
    uploadReceipt: "Adjuntar el justificante",
    receiptUploaded: "Justificante enviado. El equipo confirmará el pago.",
    noBillingAccess: "Tu acceso no incluye la facturación.",
    quotes: "Presupuestos",
    acceptQuote: "Aceptar el presupuesto",
    rejectQuote: "Rechazar",
    quoteAccepted: "Presupuesto aceptado: ya tienes su cobro en Facturación.",
  },

  menu: {
    title: "Menú Diario",
    empty: "Todavía no hay menús.",
    balance: (available: number, included: number) => `${available} de ${included} actualizaciones disponibles`,
    newMenu: "Crear un menú",
    nameLabel: "Nombre",
    kindLabel: "Tipo",
    dateLabel: "Fecha (AAAA-MM-DD)",
    templateLabel: "Plantilla",
    noTemplate: "Sin plantilla",
    startersLabel: "Primeros (uno por línea)",
    mainsLabel: "Segundos (uno por línea)",
    dessertsLabel: "Postres (uno por línea)",
    drinkLabel: "Bebida",
    priceLabel: "Precio (euros)",
    noteLabel: "Nota",
    saveVersion: "Guardar versión",
    versionSaved: "Versión guardada.",
    versionSavedAfterCutoff: "Versión guardada después de las 21:00: se acepta, pero no se garantiza que entre en la publicación prevista.",
    prepare: "Marcar como preparado",
    requestPublication: "Pedir la publicación",
    publicationRequested: "Publicación pedida.",
    deadlines: (cutoff: string, publishBy: string) => `Cambios hasta ${cutoff} · publicación antes de ${publishBy}`,
    currentVersion: (v: number) => `Contenido · versión ${v}`,
    noVersion: "Todavía sin contenido.",
    teamQueue: "Cola de Menú Diario",
    teamEmpty: "No hay publicaciones pendientes.",
  },

  reports: {
    title: "Informes",
    empty: "No hay informes.",
    period: (from: string, to: string) => `${from} – ${to}`,
    detailHint: "El informe completo, con sus gráficos y su descarga, se ve en la web.",
    sections: "Secciones incluidas",
  },

  team: {
    title: "Equipo",
    supervisorOf: (worker: string) => `Supervisor principal de ${worker}`,
    chooseAdmin: "Elegir administrador",
    noSupervisor: "Sin supervisor principal",
    saved: "Supervisor guardado.",
    invitesInWeb: "Invitar a alguien se hace desde la web.",
  },

  settings: {
    title: "Ajustes",
    notifications: "Avisos",
    notificationsHint: "Por evento. Dentro de Cuotly, por correo y en el teléfono.",
    inApp: "En Cuotly",
    email: "Correo",
    saved: "Guardado.",
    account: "Cuenta",
    sessions: "Mis sesiones",
    revokeSession: "Cerrar esta sesión",
    currentSession: "Esta sesión",
  },

  more: {
    title: "Más",
    account: "Cuenta",
  },
} as const;
