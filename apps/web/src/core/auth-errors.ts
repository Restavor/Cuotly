/**
 * `src/core/auth-errors.ts` — por qué NO se ha podido entrar.
 *
 * La acción de entrar contestaba "Correo o contraseña incorrectos" a
 * **cualquier** error de `signInWithPassword()`: credenciales malas, sí,
 * pero también el servicio caído, la red cortada, demasiados intentos y un
 * correo sin confirmar. Es afirmar algo que no se sabe, que es justo lo
 * que CA-20 prohíbe en el resto de la aplicación —"sin datos se indica el
 * MOTIVO"— y no había ninguna razón para que el login fuera la excepción.
 *
 * No es teórico y costó una tarde encontrarlo: ejecutando los recorridos
 * de Playwright desde un entorno cuya política de red bloquea la salida a
 * Supabase, la pantalla decía "Correo o contraseña incorrectos" con la
 * contraseña correcta. El mensaje mandó a mirar la semilla, los hashes y
 * las identidades de GoTrue —todo estaba bien— cuando lo que pasaba es que
 * no había línea.
 *
 * Decir "no se ha podido conectar" habría ahorrado el viaje entero, y a un
 * cliente que no puede entrar un martes por la mañana le ahorra llamar
 * para que le cambien una contraseña que no está mal.
 *
 * Lógica pura: sin Supabase, sin React (CLAUDE.md).
 */

export type SignInFailure =
  /** Las credenciales no valen. El único caso que el mensaje viejo acertaba. */
  | "invalid_credentials"
  /** El correo existe pero no se ha confirmado. */
  | "email_not_confirmed"
  /** Demasiados intentos: es temporal y hay que decirlo, no culpar a la clave. */
  | "rate_limited"
  /** No se ha podido hablar con el servicio de autenticación. */
  | "unreachable"
  /** Ha fallado algo más, y no se disfraza de credenciales. */
  | "unknown";

/**
 * La forma de un error de Supabase Auth en lo que aquí importa. Se
 * describe en vez de importar el tipo del SDK para que este módulo siga
 * sin dependencias (CLAUDE.md).
 */
export interface AuthErrorLike {
  readonly message?: string;
  /** El HTTP de la respuesta. `undefined` cuando no LLEGÓ a haber respuesta. */
  readonly status?: number;
  readonly code?: string;
  readonly name?: string;
}

export function classifySignInError(error: AuthErrorLike | null | undefined): SignInFailure | null {
  if (!error) return null;

  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  const name = (error.name ?? "").toLowerCase();

  // Sin `status` no hubo respuesta del servidor: la petición no llegó o no
  // volvió. El SDK lo marca además como `AuthRetryableFetchError`.
  //
  // Se mira ANTES que el mensaje: un fallo de red trae textos que cambian
  // con el navegador y la versión ("failed to fetch", "load failed",
  // "network error"), y ninguno menciona credenciales.
  if (
    name.includes("retryable") ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("timeout")
  ) {
    return "unreachable";
  }

  if (error.status === 429 || code.includes("over_request_rate_limit")) {
    return "rate_limited";
  }

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "email_not_confirmed";
  }

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "invalid_credentials";
  }

  // 5xx es del servidor, nunca de quien escribe la contraseña.
  if (typeof error.status === "number" && error.status >= 500) {
    return "unreachable";
  }

  // Un 400 sin código reconocido sigue siendo, casi siempre, credenciales:
  // es lo que contesta GoTrue. Cualquier otra cosa, no se adivina.
  if (error.status === 400) return "invalid_credentials";

  return error.status === undefined ? "unreachable" : "unknown";
}
