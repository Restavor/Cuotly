/**
 * `src/core/space-lifecycle.ts` — el espacio visto desde dentro y a lo
 * largo del tiempo (PRD §33, RN-CIC; §9, §127 y §141 de la maestra;
 * Fase 4, Hito 20). Lógica de dominio pura, sin Supabase, sin Next y sin
 * React (CLAUDE.md).
 *
 * Qué decide este archivo:
 *
 *   · **Los diez pasos de §9**, en su orden, y cuáles se pueden saber por
 *     un dato y cuáles no. La lista está duplicada a propósito con
 *     `onboarding_steps()` de la migración 92, y `listas-compartidas.test.ts`
 *     vigila que no se separen —misma decisión que con los informes, las
 *     oportunidades y los niveles de Modo soporte—.
 *   · **Cómo se lee un paso hecho** (RN-CIC-02): la diferencia entre "el
 *     dato está" y "el propietario dijo que lo daba por bueno" no es
 *     cosmética, y la pantalla tiene que decir cuál de las dos es.
 *   · **Quién puede restaurar un espacio archivado** según el plazo de 30
 *     días (RN-CIC-08).
 *   · **Con qué rol se queda cada uno al transferir la propiedad**
 *     (RN-CIC-05).
 *   · **Qué hacer con cada cosa que impide cerrar una cuenta** (RN-CIC-12).
 *
 * Lo que NO está aquí:
 *
 *   · **El control de acceso.** Quién archiva, quién transfiere y quién
 *     exporta lo vuelve a decidir el servidor (migración 92). Lo de aquí
 *     es la misma cuenta, para que la pantalla no ofrezca un botón que el
 *     servidor va a rechazar.
 *   · **El texto**, que sale de `src/i18n/es.ts` (CLAUDE.md).
 *   · **Ningún borrado.** §127 dice "después se programa eliminación", y
 *     programar es lo único que hace el producto: qué se elimina y qué se
 *     conserva por obligación legal es del bloque legal (§170.1,
 *     pendiente 20).
 */

/**
 * §9 · los diez pasos, en el orden en que los enumera la maestra.
 *
 * `derivable` dice si el paso se puede saber mirando los datos. Los cuatro
 * que no lo son tienen ya un valor de partida —`Europe/Madrid`, el 21 %,
 * "todos los avisos activados" (RN-NOT-02) y la 2FA, que para el
 * propietario de un espacio es opcional (RN-ADM-02)— y en la base no hay
 * nada que distinga "el valor por omisión" de "mirado y decidido". Darlos
 * por hechos sería el dato de relleno que CLAUDE.md prohíbe; se completan
 * con la confirmación de una persona, que es un hecho con actor y fecha.
 */
export const ONBOARDING_STEPS = [
  { step: "space_details", derivable: true },
  { step: "logo", derivable: true },
  { step: "timezone", derivable: false },
  { step: "working_hours", derivable: true },
  { step: "taxes", derivable: false },
  { step: "plans_and_services", derivable: true },
  { step: "first_establishment", derivable: true },
  { step: "first_worker", derivable: true },
  { step: "notifications", derivable: false },
  { step: "security", derivable: false },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["step"];

export function isOnboardingStep(value: string): value is OnboardingStep {
  return ONBOARDING_STEPS.some((s) => s.step === value);
}

/** RN-CIC-02 · de dónde sale que un paso esté hecho. */
export type OnboardingSource = "data" | "confirmed";

export interface OnboardingStepProgress {
  readonly step: OnboardingStep;
  readonly done: boolean;
  /** `null` cuando el paso está pendiente. */
  readonly source: OnboardingSource | null;
}

/**
 * RN-CIC-02 · el paso está hecho porque el dato lo dice o porque el
 * propietario lo confirmó, y el dato manda sobre la confirmación: si el
 * logotipo está subido, el origen es "data" aunque además se confirmara.
 */
export function stepProgress(
  step: OnboardingStep,
  byData: boolean,
  confirmed: boolean,
): OnboardingStepProgress {
  return {
    step,
    done: byData || confirmed,
    source: byData ? "data" : confirmed ? "confirmed" : null,
  };
}

/** RN-CIC-04 · el asistente termina cuando los diez están hechos. */
export function onboardingIsComplete(
  progress: readonly OnboardingStepProgress[],
): boolean {
  if (progress.length !== ONBOARDING_STEPS.length) return false;
  return progress.every((p) => p.done);
}

/** Cuántos quedan, que es lo que enseña la pantalla mientras no terminan. */
export function onboardingPending(
  progress: readonly OnboardingStepProgress[],
): readonly OnboardingStep[] {
  return progress.filter((p) => !p.done).map((p) => p.step);
}

/**
 * RN-CIC-01 · §9 dice "completa **progresivamente**", así que el asistente
 * no bloquea nada. Está aquí escrito como función y no como comentario
 * porque es una regla, y una regla sin test se convierte en una costumbre.
 */
export function onboardingBlocksTheSpace(): false {
  return false;
}

/** RN-CIC-14 · lo que el libro del ciclo de vida apunta. */
export const SPACE_LIFECYCLE_OPERATIONS = [
  "ownership_transferred",
  "archived",
  "restored",
] as const;
export type SpaceLifecycleOperation = (typeof SPACE_LIFECYCLE_OPERATIONS)[number];

/** §141 · los tres alcances de una exportación. */
export const EXPORT_SCOPES = ["space", "group", "establishment"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

/**
 * RN-CIC-05 · transferir la propiedad la **mueve**, no la duplica: el
 * destinatario pasa a propietario y quien transfiere pasa a administrador
 * de mantenimiento. Quien transfiere no se queda fuera del espacio:
 * echarse a sí mismo no es lo que pidió.
 */
export interface OwnershipTransferOutcome {
  readonly previousOwnerRole: "admin";
  readonly newOwnerRole: "owner";
}

export function ownershipTransferOutcome(): OwnershipTransferOutcome {
  return { previousOwnerRole: "admin", newOwnerRole: "owner" };
}

/**
 * RN-CIC-06 · §127: "siempre debe existir al menos un propietario". Esto
 * es la misma cuenta que hace el disparador del servidor, para que la
 * pantalla no ofrezca quitarle el rol al último.
 */
export function canStopBeingOwner(activeOwnersInSpace: number): boolean {
  return activeOwnersInSpace > 1;
}

/** Quién puede sacar a un espacio del archivado de su dueño (RN-CIC-08). */
export type SpaceRestorer = "owner" | "platform";

/**
 * RN-CIC-08 · dentro de los 30 días lo restaura su propietario; pasados,
 * es de la plataforma, igual que la reactivación tardía de RN-SUB-09. El
 * plazo es lo que separa "me he arrepentido" de "esto ya estaba decidido".
 */
export function whoCanRestore(
  recoverableUntil: Date,
  now: Date,
): readonly SpaceRestorer[] {
  return now <= recoverableUntil ? ["owner", "platform"] : ["platform"];
}

export function canOwnerRestore(recoverableUntil: Date, now: Date): boolean {
  return whoCanRestore(recoverableUntil, now).includes("owner");
}

/**
 * RN-CIC-09 · §127: "después se programa eliminación". La fecha es la
 * misma que la de recuperación —no hay dos plazos que recordar— y **no
 * dispara ningún borrado**: qué se elimina y qué se conserva por
 * obligación legal es del bloque legal (§170.1, pendiente 20).
 */
export function deletionScheduledAt(
  archivedAt: Date,
  recoveryDays: number,
): Date {
  const scheduled = new Date(archivedAt.getTime());
  scheduled.setUTCDate(scheduled.getUTCDate() + recoveryDays);
  return scheduled;
}

/** RN-CIC-12 · qué impide cerrar una cuenta, y qué hacer con ello. */
export type AccountBlockerKind = "space" | "group";
export type AccountBlockerRemedy = "transfer_ownership" | "transfer_or_close_group";

export interface AccountDeletionBlocker {
  readonly kind: AccountBlockerKind;
  readonly entityId: string;
  readonly entityName: string;
  readonly remedy: AccountBlockerRemedy;
}

export function accountRemedyFor(kind: AccountBlockerKind): AccountBlockerRemedy {
  return kind === "space" ? "transfer_ownership" : "transfer_or_close_group";
}

/**
 * RN-CIC-12 · §141: "Un usuario no puede eliminar su cuenta si es único
 * propietario de un espacio o grupo". Sin bloqueos se puede pedir el
 * cierre; **pedirlo no lo ejecuta**, porque el cierre en sí es del bloque
 * legal y no existe (§170.1, pendiente 20).
 */
export function canRequestAccountDeletion(
  blockers: readonly AccountDeletionBlocker[],
): boolean {
  return blockers.length === 0;
}
