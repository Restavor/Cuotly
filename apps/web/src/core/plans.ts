/**
 * `src/core/plans.ts` — las decisiones de §6.4 (cambio de plan) y de la
 * permanencia de §6.1/§6.2, como lógica pura: sin Supabase, sin Next.js,
 * sin React (CLAUDE.md).
 *
 * Lo que este módulo NO hace, y es deliberado: **el prorrateo**. La fórmula
 * de RN-COM-18 vive en `plan_change_proration()` en el servidor, que es
 * quien cobra, y tenerla también aquí sería tener dos verdades sobre el
 * dinero. La pantalla la pide con `plan_change_preview()` y enseña lo que
 * el servidor le conteste.
 *
 * Lo que sí hace es decidir **qué camino** tiene un cambio de plan —mejora
 * inmediata, mejora en renovación o reducción— y si la permanencia vigente
 * deja tomarlo. El servidor vuelve a comprobar las dos cosas: aquí solo se
 * decide qué botón tiene sentido enseñar (CLAUDE.md: ocultar un botón no
 * es un control de acceso).
 */

/**
 * La duración de la permanencia no se redeclara aquí: `COMMITMENT_MONTHS`
 * ya tiene dueño en `core/finance.ts`, que es quien la estrenó con
 * RN-FIN-14. Tener el mismo número en dos archivos es cómo tres listas de
 * estados se quedaron desfasadas de la base durante meses (salvedad 18 del
 * ROADMAP).
 */

/**
 * Las tres direcciones posibles de un cambio de plan. `same` existe porque
 * el servidor la trata aparte: `change_plan_immediately()` con el mismo
 * plan no hace nada (CA-17) y `schedule_plan_change()` la rechaza.
 */
export type PlanChangeDirection = "upgrade" | "downgrade" | "same";

/**
 * RN-COM-15 frente a RN-COM-17. El criterio es el precio, que es el mismo
 * que usa `schedule_plan_change()` en el servidor: un plan más caro es una
 * mejora, uno más barato o igual de caro no lo es.
 *
 * Igual de caro cuenta como reducción a efectos de camino —no se puede
 * cobrar una diferencia de cero como si fuera una mejora—, salvo que sea
 * literalmente el mismo plan, que es `same`.
 */
export function planChangeDirection(input: {
  readonly currentPlanId: string;
  readonly targetPlanId: string;
  readonly currentPriceCents: number;
  readonly targetPriceCents: number;
}): PlanChangeDirection {
  if (input.currentPlanId === input.targetPlanId) return "same";
  return input.targetPriceCents > input.currentPriceCents ? "upgrade" : "downgrade";
}

/**
 * RN-COM-17: "reducción: solo en renovación y solo tras cumplir la
 * permanencia vigente". La permanencia se mide contra el **final del ciclo**
 * —que es cuando el cambio se aplicaría—, no contra hoy: un ciclo que
 * termina después de la permanencia es válido aunque la permanencia siga
 * viva ahora mismo. Es el mismo criterio que la función del servidor.
 *
 * Sin permanencia registrada no hay nada que impida la reducción.
 */
export function downgradeAllowedAtRenewal(input: {
  readonly cycleEndsAt: Date | null;
  readonly commitmentEndsAt: Date | null;
}): boolean {
  if (input.commitmentEndsAt === null) return true;
  if (input.cycleEndsAt === null) return false;
  return input.cycleEndsAt.getTime() >= input.commitmentEndsAt.getTime();
}

/**
 * RN-COM-04/05/09 · si la permanencia sigue viva en un instante dado. Una
 * permanencia sin fecha de fin no existe: se devuelve `false` en vez de
 * suponer que dura para siempre.
 */
export function commitmentIsCurrent(now: Date, commitmentEndsAt: Date | null): boolean {
  if (commitmentEndsAt === null) return false;
  return commitmentEndsAt.getTime() > now.getTime();
}

/**
 * Qué se le puede ofrecer hoy a una suscripción para pasar a `targetPlan`.
 *
 * - `immediate`: RN-COM-15, mejora que se cobra prorrateada al momento.
 * - `renewal`: RN-COM-16 (mejora que espera) o RN-COM-17 (reducción con la
 *   permanencia cumplida).
 * - `blocked`: la reducción cuya permanencia todavía no se ha cumplido.
 * - `none`: es el plan que ya tiene.
 *
 * Una mejora admite las dos vías: inmediata (se cobra ahora) o en
 * renovación (bolsa completa el día de la renovación, sin prorrateo). Quien
 * decide es el administrador, así que se devuelven las dos.
 */
export type PlanChangeOption = "immediate" | "renewal" | "blocked" | "none";

export function planChangeOptions(input: {
  readonly currentPlanId: string;
  readonly targetPlanId: string;
  readonly currentPriceCents: number;
  readonly targetPriceCents: number;
  readonly cycleEndsAt: Date | null;
  readonly commitmentEndsAt: Date | null;
}): readonly PlanChangeOption[] {
  const direction = planChangeDirection(input);
  if (direction === "same") return ["none"];
  if (direction === "upgrade") return ["immediate", "renewal"];
  return downgradeAllowedAtRenewal(input) ? ["renewal"] : ["blocked"];
}
