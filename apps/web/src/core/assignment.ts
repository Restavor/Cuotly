/**
 * `src/core/assignment.ts` — a quién se le asigna un trabajo (PRD §14.1
 * RN-ASG-01 a 06, HU-16). Lógica de dominio pura: sin Supabase, sin
 * Next.js, sin React (CLAUDE.md, regla de estilo de código).
 *
 * **RN-ASG-06 · lo que este módulo NO hace.** La fórmula ponderada
 * definitiva está *pendiente de calibración* y **no debe inventarse**
 * (CLAUDE.md, "No inventes lo que está pendiente"). Aquí no hay ni un solo
 * porcentaje, peso ni umbral: el orden es determinista y lexicográfico,
 * exactamente el del PRD. La tabla `assignment_weights` se crea vacía en la
 * migración del Hito 6 para poder sustituir este orden por una fórmula
 * ponderada cuando Bosco la calibre, sin tocar el resto del sistema.
 *
 * La base de datos vuelve a decidir lo mismo por su cuenta
 * (`list_job_candidates()`/`auto_assign_job()` de
 * supabase/migrations/20260830000022_hito6_trabajos.sql): el cliente nunca
 * es la autoridad de una asignación (CLAUDE.md, MUST). Este módulo existe
 * para poder probar la regla como lógica pura y para que la interfaz
 * explique la recomendación con el mismo criterio que la aplicó.
 */

/** PRD §4.6. `general` habilita cualquier categoría (RN-ASG-01). */
export const SPECIALTIES = ["web", "design", "copy", "seo", "daily_menu", "analytics", "general"] as const;

export type Specialty = (typeof SPECIALTIES)[number];

/** PRD §4.5, los cinco estados de un miembro interno. */
export type MemberStatus = "invited" | "active" | "temporarily_absent" | "inactive" | "access_revoked";

/**
 * Un candidato con todo lo que los filtros duros y el desempate de
 * RN-ASG-06 necesitan. Todo llega ya calculado por quien llama (el
 * servidor): este módulo no consulta nada.
 */
export type CandidateWorker = {
  readonly workerId: string;
  /** Capacidad `perform_jobs` (§4.2): puede ejecutar trabajos. */
  readonly canPerformJobs: boolean;
  /**
   * §4.2: el propietario del espacio "puede ejecutar trabajos **solo como
   * recurso operativo cuando no hay nadie más disponible**" — nunca por
   * recomendación ni por asignación automática (ver `rankCandidates`).
   */
  readonly isSpaceOwner: boolean;
  /** RN-ASG-01: asignado a ese restaurante. */
  readonly assignedToEstablishment: boolean;
  /** RN-ASG-02: solo participan los trabajadores activos y válidos. */
  readonly memberStatus: MemberStatus;
  readonly specialties: readonly Specialty[];
  /** RN-ASG-10/11: disponibilidad declarada. No modifica el SLA del cliente. */
  readonly availabilityDeclared: boolean;
  /** §14.4: puntos de carga activos (trabajos `assigned`/`in_progress` y tareas asignadas). */
  readonly activeLoadPoints: number;
  readonly activeJobCount: number;
  /** Cuántos de sus trabajos activos tienen un plazo próximo a vencer. */
  readonly deadlinesSoonCount: number;
  /** `null` = nunca ha recibido una asignación (RN-ASG-06, reparto equilibrado). */
  readonly lastAssignedAt: Date | null;
};

/**
 * RN-ASG-06, *filtros duros (excluyen)*: capacidad de realizar el trabajo →
 * asignado al establecimiento → estado activo → especialidad compatible →
 * disponibilidad declarada.
 *
 * `general` cubre cualquier categoría sin impedir tener especialidades
 * concretas además (§4.6). `temporarily_absent` no es "activo" (§4.5: una
 * ausencia aprobada marca al trabajador como no disponible, RN-ASG-12).
 */
export function isEligibleCandidate(candidate: CandidateWorker, requiredSpecialty: Specialty): boolean {
  return (
    candidate.canPerformJobs &&
    candidate.assignedToEstablishment &&
    candidate.memberStatus === "active" &&
    (candidate.specialties.includes("general") || candidate.specialties.includes(requiredSpecialty)) &&
    candidate.availabilityDeclared
  );
}

/**
 * RN-ASG-06, *desempate, en este orden*: menor carga actual en puntos →
 * menor número de trabajos activos → menos plazos próximos a vencer →
 * mayor tiempo desde su última asignación (reparto equilibrado).
 *
 * Quien nunca ha recibido una asignación (`lastAssignedAt` null) va primero
 * en el último criterio: es el reparto más equilibrado posible, y es la
 * lectura literal de "mayor tiempo desde su última asignación".
 *
 * El `workerId` cierra la comparación al final. No es un criterio de
 * negocio (ni lo pretende): es lo que garantiza que dos candidatos
 * idénticos en los cuatro criterios del PRD se ordenen siempre igual, para
 * que la recomendación sea reproducible y testeable. Sin él, el orden
 * dependería del orden en que la base de datos devolviera las filas.
 */
export function compareCandidates(a: CandidateWorker, b: CandidateWorker): number {
  if (a.activeLoadPoints !== b.activeLoadPoints) return a.activeLoadPoints - b.activeLoadPoints;
  if (a.activeJobCount !== b.activeJobCount) return a.activeJobCount - b.activeJobCount;
  if (a.deadlinesSoonCount !== b.deadlinesSoonCount) return a.deadlinesSoonCount - b.deadlinesSoonCount;

  const aLast = a.lastAssignedAt === null ? -Infinity : a.lastAssignedAt.getTime();
  const bLast = b.lastAssignedAt === null ? -Infinity : b.lastAssignedAt.getTime();
  if (aLast !== bLast) return aLast - bLast;

  return a.workerId < b.workerId ? -1 : a.workerId > b.workerId ? 1 : 0;
}

/**
 * Candidatos válidos (RN-ASG-02) ya ordenados por RN-ASG-06.
 *
 * El propietario del espacio queda **fuera** de la lista, aunque cumpla
 * todos los filtros: §4.2 le permite ejecutar trabajos "solo como recurso
 * operativo cuando no hay nadie más disponible", y RN-ASG-05 dice qué pasa
 * cuando no hay nadie más — el trabajo queda pendiente y se avisa al
 * propietario y a todos los administradores, no se le adjudica solo. El
 * propietario entra entonces por decisión suya explícita (una asignación
 * manual), no por recomendación ni por asignación automática.
 */
export function rankCandidates(
  candidates: readonly CandidateWorker[],
  requiredSpecialty: Specialty,
): readonly CandidateWorker[] {
  return candidates
    .filter((c) => !c.isSpaceOwner && isEligibleCandidate(c, requiredSpecialty))
    .sort(compareCandidates);
}

/**
 * HU-16 · RN-ASG-03/04/05, los tres desenlaces posibles:
 * - `auto_assign`: hay **exactamente un** candidato válido, Cuotly lo
 *   asigna automáticamente (RN-ASG-03).
 * - `recommendation`: hay varios; Cuotly recomienda uno y el propietario
 *   acepta o elige otro (RN-ASG-04). La recomendación **no** asigna.
 * - `pending_assignment`: no hay ninguno; el trabajo queda pendiente, se
 *   avisa al propietario y a todos los administradores, y las alertas
 *   crecen mientras nadie lo asuma (RN-ASG-05, avisos en el Hito 8).
 */
export type AssignmentDecision =
  | { readonly outcome: "auto_assign"; readonly workerId: string; readonly ranked: readonly CandidateWorker[] }
  | {
      readonly outcome: "recommendation";
      readonly recommendedWorkerId: string;
      readonly ranked: readonly CandidateWorker[];
    }
  | { readonly outcome: "pending_assignment"; readonly ranked: readonly CandidateWorker[] };

export function decideAssignment(
  candidates: readonly CandidateWorker[],
  requiredSpecialty: Specialty,
): AssignmentDecision {
  const ranked = rankCandidates(candidates, requiredSpecialty);

  if (ranked.length === 0) return { outcome: "pending_assignment", ranked };
  if (ranked.length === 1) return { outcome: "auto_assign", workerId: ranked[0].workerId, ranked };
  return { outcome: "recommendation", recommendedWorkerId: ranked[0].workerId, ranked };
}
