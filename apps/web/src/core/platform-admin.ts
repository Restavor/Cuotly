/**
 * `src/core/platform-admin.ts` — el panel de Administración de Cuotly, Modo
 * soporte y la 2FA (PRD §32, RN-ADM; §128, §129, §136 y §167 de la maestra;
 * Fase 4, Hito 19). Lógica de dominio pura, sin Supabase, sin Next y sin
 * React (CLAUDE.md).
 *
 * Qué decide este archivo:
 *
 *   · **Los doce bloques de §128**, en su orden, y a qué pantalla lleva
 *     cada uno (RN-ADM-04).
 *   · **Los tres niveles de Modo soporte** y **la duración** que admite
 *     una sesión (RN-ADM-06), duplicados a propósito con el CHECK de
 *     `support_sessions` y con `start_support_session()` de la migración
 *     91; `listas-compartidas.test.ts` vigila que no se separen.
 *   · **Cuándo una sesión está viva** y cuánto le queda, para la banda del
 *     armazón (RN-ADM-07).
 *   · **Quién es plataforma y qué le falta**: identidad frente a cerradura
 *     (RN-ADM-01, RN-ADM-02). Es la misma cuenta que hacen
 *     `my_platform_access()` y las funciones `is_platform_*()`, para que la
 *     pantalla no ofrezca lo que el servidor va a rechazar.
 *   · **Para quién es obligatoria la 2FA** (§136).
 *
 * Lo que NO está aquí: el control de acceso. Quién entra en un espacio
 * ajeno lo decide `is_space_member()` en la base (migración 91), y lo
 * comprueba `plataforma_panel_soporte_y_2fa.sql`.
 */

/** §128 · los doce bloques del panel, en el orden en que los da la maestra. */
export const PANEL_BLOCKS = [
  "users",
  "spaces",
  "space_requests",
  "subscriptions",
  "revenue",
  "active_trials",
  "nonpayment",
  "storage",
  "activity",
  "incidents",
  "support",
  "audit",
] as const;
export type PanelBlock = (typeof PANEL_BLOCKS)[number];

/**
 * A qué pantalla del panel lleva cada bloque. Varios comparten pantalla a
 * propósito: suscripciones, pruebas activas, impagos y almacenamiento son
 * la misma fila de espacio mirada desde cuatro sitios (RN-ADM-04).
 * `incidents` no lleva a ninguna: es el Hito 21 y el bloque lo dice con su
 * motivo, no con una ruta que acabe en 404.
 */
export function panelBlockHref(block: PanelBlock): string | null {
  switch (block) {
    case "users":
      return "/administracion/usuarios";
    case "spaces":
    case "subscriptions":
    case "active_trials":
    case "storage":
      return "/administracion/espacios";
    case "space_requests":
      return "/administracion/solicitudes";
    case "revenue":
    case "nonpayment":
      return "/administracion/cobros";
    case "activity":
    case "audit":
      return "/administracion/auditoria";
    case "support":
      return "/administracion/soporte";
    case "incidents":
      return null;
  }
}

/** §129 · "mínimo privilegio necesario": el nivel se elige al abrir. */
export const SUPPORT_ACCESS_LEVELS = ["read", "admin", "owner"] as const;
export type SupportAccessLevel = (typeof SUPPORT_ACCESS_LEVELS)[number];

export function isSupportAccessLevel(value: string): value is SupportAccessLevel {
  return (SUPPORT_ACCESS_LEVELS as readonly string[]).includes(value);
}

/**
 * RN-ADM-06 · entre 15 y 240 minutos, 60 si no se dice (lectura, pendiente
 * 22). Los mismos tres números que `start_support_session()`.
 */
export const SUPPORT_SESSION_MINUTES = { min: 15, max: 240, default: 60 } as const;

export function supportDurationIsValid(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= SUPPORT_SESSION_MINUTES.min &&
    minutes <= SUPPORT_SESSION_MINUTES.max
  );
}

export interface SupportSessionWindow {
  readonly expiresAt: string;
  readonly endedAt: string | null;
}

/** RN-ADM-07 · viva mientras no se haya cerrado ni agotado. */
export function supportSessionIsActive(session: SupportSessionWindow, now: Date): boolean {
  if (session.endedAt !== null) return false;
  return new Date(session.expiresAt).getTime() > now.getTime();
}

/** Lo que le queda, en minutos enteros; nunca negativo. */
export function supportRemainingMinutes(expiresAt: string, now: Date): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

/**
 * RN-ADM-07 · con qué destinos se pinta el armazón a quien está en soporte.
 * `read` navega como un administrador —ve lo mismo— y la banda dice que no
 * puede tocar nada; `owner`, como el propietario. **No autoriza nada**: lo
 * que puede hacer lo decide `has_capability()` en la base.
 */
export function supportShellRole(level: SupportAccessLevel): "admin" | "owner" {
  return level === "owner" ? "owner" : "admin";
}

/**
 * Lo que `my_platform_access()` cuenta de quien pregunta: la identidad de
 * plataforma y si la sesión ha pasado el segundo factor. Las dos cosas por
 * separado, porque la pantalla necesita distinguir "no eres de Cuotly" de
 * "eres de Cuotly pero te falta la 2FA".
 */
export interface PlatformAccess {
  readonly isOwner: boolean;
  readonly isAdmin: boolean;
  readonly canApproveSpaces: boolean;
  readonly canManageSubscriptions: boolean;
  readonly canSupport: boolean;
  readonly twoFactor: boolean;
}

/** RN-ADM-01 · Bosco o un Administrador de Cuotly, con o sin cerradura. */
export function isPlatformPerson(access: PlatformAccess): boolean {
  return access.isOwner || access.isAdmin;
}

/** RN-ADM-02 · es de Cuotly y todavía no ha pasado el segundo factor. */
export function platformNeedsTwoFactor(access: PlatformAccess): boolean {
  return isPlatformPerson(access) && !access.twoFactor;
}

/** RN-ADM-01 · lee el panel entero. La misma cuenta que `is_platform_member()`. */
export function canReadPanel(access: PlatformAccess): boolean {
  return isPlatformPerson(access) && access.twoFactor;
}

/** §167 · Bosco siempre; un Administrador, con su permiso. Siempre con 2FA. */
export function canApproveSpaces(access: PlatformAccess): boolean {
  return access.twoFactor && (access.isOwner || (access.isAdmin && access.canApproveSpaces));
}

export function canManageSubscriptions(access: PlatformAccess): boolean {
  return access.twoFactor && (access.isOwner || (access.isAdmin && access.canManageSubscriptions));
}

export function canOpenSupport(access: PlatformAccess): boolean {
  return access.twoFactor && (access.isOwner || (access.isAdmin && access.canSupport));
}

/** §167 · "Nombrar Admin Cuotly: Bosco sí; Admin Cuotly no." */
export function canNamePlatformAdmins(access: PlatformAccess): boolean {
  return access.twoFactor && access.isOwner;
}

/**
 * §136 · para quién es obligatoria la 2FA, para quién muy recomendada y
 * para quién opcional. La pantalla de seguridad lo dice con estas palabras
 * y el servidor la hace cumplir solo donde es obligatoria (RN-ADM-02).
 */
export const TWO_FACTOR_POLICY = {
  platform_owner: "mandatory",
  platform_admin: "mandatory",
  space_owner: "recommended",
  space_admin: "recommended",
  worker: "optional",
  client: "optional",
} as const;
export type TwoFactorAudience = keyof typeof TWO_FACTOR_POLICY;
export type TwoFactorPolicy = (typeof TWO_FACTOR_POLICY)[TwoFactorAudience];

export function twoFactorPolicyFor(access: PlatformAccess, spaceRole: string | null): TwoFactorPolicy {
  if (access.isOwner) return TWO_FACTOR_POLICY.platform_owner;
  if (access.isAdmin) return TWO_FACTOR_POLICY.platform_admin;
  if (spaceRole === "owner") return TWO_FACTOR_POLICY.space_owner;
  if (spaceRole === "admin") return TWO_FACTOR_POLICY.space_admin;
  if (spaceRole === "worker") return TWO_FACTOR_POLICY.worker;
  return TWO_FACTOR_POLICY.client;
}
