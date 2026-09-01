/**
 * Todo el texto visible de la app móvil, en un solo sitio (CLAUDE.md:
 * "todo el texto visible al usuario en español, siempre a través del
 * sistema de i18n. Nunca literales de UI incrustados en los componentes").
 *
 * Es un archivo propio y no el de la web: `apps/web/src/i18n/es.ts` vive
 * dentro del paquete de Next.js y no es importable desde Expo. Cuando el
 * texto empiece a repetirse entre los dos clientes, su sitio es
 * `packages/shared`.
 */
export const es = {
  auth: {
    emailLabel: "Correo electrónico",
    passwordLabel: "Contraseña",
    validationRequired: "Rellena correo y contraseña.",
    login: {
      title: "Entrar en Cuotly",
      submit: "Entrar",
      submitPending: "Entrando…",
      invalidCredentials: "Correo o contraseña incorrectos.",
      noAccount: "¿No tienes cuenta?",
      signupLink: "Regístrate",
    },
    signup: {
      title: "Crear cuenta en Cuotly",
      submit: "Crear cuenta",
      submitPending: "Creando cuenta…",
      hasAccount: "¿Ya tienes cuenta?",
      loginLink: "Entra",
    },
  },
  home: {
    title: "Cuotly",
    signedInAs: (email: string) => `Has entrado como ${email}.`,
    noFeaturesYet:
      "Todavía no hay más funcionalidad — esto es la evidencia del Hito 1: el registro y el inicio de sesión funcionan de verdad.",
    signOut: "Cerrar sesión",
  },
} as const;
