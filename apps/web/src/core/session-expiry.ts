/**
 * A08 · cuándo decir "Tu sesión ha caducado" en vez de mandar a entrar
 * sin más.
 *
 * Solo cuando se sabe: el navegador trae la cookie de sesión de Supabase,
 * el servidor ya no la acepta, y el motivo es un rechazo (un 4xx), no que
 * no haya habido línea. Sin cookie es alguien que no había entrado, y eso
 * es la pantalla de entrar, no una sesión caducada. Con la red caída
 * tampoco: decir "caducada" mandaría a entrar a quien sigue dentro, que es
 * el mismo error que `auth-errors.ts` evita al entrar.
 *
 * Y solo en páginas que piden sesión. Las de la puerta de entrada se leen
 * sin ella, y los envíos de formularios (`POST`) no se redirigen: la
 * acción ya contesta por su cuenta que falta la sesión.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/solicitud/",
  "/alta/",
  "/invitaciones/",
  "/panel/",
  "/sesion-caducada",
  "/auth/",
  "/api/",
  "/estado",
  "/armazon",
  "/styleguide",
] as const;

export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

export function sessionExpired(input: {
  readonly method: string;
  readonly pathname: string;
  readonly hadAuthCookie: boolean;
  readonly hasUser: boolean;
  readonly errorStatus: number | undefined;
}): boolean {
  if (input.method !== "GET") return false;
  if (!input.hadAuthCookie || input.hasUser) return false;
  if (input.errorStatus === undefined || input.errorStatus < 400 || input.errorStatus >= 500) return false;
  return !PUBLIC_PREFIXES.some((prefijo) => input.pathname.startsWith(prefijo));
}
