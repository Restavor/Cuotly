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
 * `incidents` lleva a la bandeja desde el Hito 21 (RN-SOP-15).
 */
export function panelBlockHref(block: PanelBlock): string {
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
      // Hito 21 · la bandeja de incidencias (RN-SOP-15).
      return "/administracion/incidencias";
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
  /** RN-ADM-14 (migración 140) · eliminar y recuperar cuentas, espacios y restaurantes. */
  readonly canDeleteAccounts: boolean;
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

/**
 * RN-ADM-14 (decisión 81) · eliminar y recuperar cuentas, espacios y
 * restaurantes: Bosco siempre; un Administrador, con su permiso. La misma
 * cuenta que `is_platform_account_manager()`.
 */
export function canDeleteAccounts(access: PlatformAccess): boolean {
  return access.twoFactor && (access.isOwner || (access.isAdmin && access.canDeleteAccounts));
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

/**
 * RN-ADM-19 (decisión 81) · lo que `platform_account_deletion_preview()`
 * cuenta antes de eliminar una cuenta: si está protegida (RN-ADM-20), si
 * ya está eliminada y, de cada espacio del que es la única propietaria,
 * entre quién se puede elegir a la persona que se queda con él.
 */
export interface DeletionCandidate {
  readonly userId: string;
  readonly name: string;
  readonly role: "admin" | "worker";
}

export interface SoleOwnerSpace {
  readonly spaceId: string;
  readonly spaceName: string;
  /** Vacío: no hay nadie más, y el espacio se elimina con la cuenta. */
  readonly candidates: readonly DeletionCandidate[];
}

export interface AccountDeletionPreview {
  readonly email: string;
  readonly protected: boolean;
  readonly closed: boolean;
  readonly soleOwnerSpaces: readonly SoleOwnerSpace[];
  readonly teamMemberships: number;
  readonly clientAccesses: number;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * Lee el `jsonb` de la vista previa. Lo que no tenga forma se descarta:
 * un candidato sin id no se puede elegir, y un espacio sin id no se puede
 * mandar de vuelta. Si algo falta, la cuenta sale **protegida**: ante la
 * duda, no se ofrece el botón (el servidor lo comprueba igual).
 */
export function readAccountDeletionPreview(value: unknown): AccountDeletionPreview {
  const raw = record(value);
  const spaces = Array.isArray(raw.sole_owner_spaces) ? raw.sole_owner_spaces : [];
  return {
    email: typeof raw.email === "string" ? raw.email : "",
    protected: raw.protected !== false,
    closed: raw.closed === true,
    soleOwnerSpaces: spaces.flatMap((item) => {
      const s = record(item);
      if (typeof s.space_id !== "string") return [];
      const candidates = Array.isArray(s.candidates) ? s.candidates : [];
      return [
        {
          spaceId: s.space_id,
          spaceName: typeof s.space_name === "string" ? s.space_name : "—",
          candidates: candidates.flatMap((c) => {
            const r = record(c);
            if (typeof r.user_id !== "string" || (r.role !== "admin" && r.role !== "worker")) return [];
            return [{ userId: r.user_id, name: typeof r.name === "string" ? r.name : "—", role: r.role }];
          }),
        },
      ];
    }),
    teamMemberships: count(raw.team_memberships),
    clientAccesses: count(raw.client_accesses),
  };
}

/**
 * RN-ADM-19 · lo que se manda al servidor: `{ espacio: persona }` solo de
 * los espacios donde se eligió a alguien que está en su lista. "Al azar"
 * es no mandar nada para ese espacio, y lo que no esté en la lista no se
 * cuela: el servidor lo rechazaría de todos modos.
 */
export function successorsFromChoices(
  spaces: readonly SoleOwnerSpace[],
  choices: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const space of spaces) {
    const chosen = choices[space.spaceId];
    if (chosen && space.candidates.some((c) => c.userId === chosen)) out[space.spaceId] = chosen;
  }
  return out;
}
