import { es } from "@/i18n/es";

type Step = "approved" | "conditions" | "pay" | "start";
const ORDER: readonly Step[] = ["approved", "conditions", "pay", "start"];

/**
 * Los cuatro pasos de la maqueta (`AgentsCondiciones`, `AgentsPendientePago`): Aprobado · Condiciones · Pagar el primer
 * mes · Empezar. Dónde está la persona lo dice `current`; los anteriores están hechos. Nunca solo color: cada paso lleva su
 * número o su marca de hecho, y el actual se anuncia con `aria-current`.
 */
export function BillingSteps({ current }: { current: Exclude<Step, "start"> }) {
  const t = es.agents.billing.steps;
  const at = ORDER.indexOf(current);
  return (
    <ol aria-label={t.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="billing-steps">
      {ORDER.map((step, i) => {
        const done = i < at;
        const isCurrent = i === at;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={`flex items-center gap-2 ${isCurrent ? "font-semibold text-text" : "text-text-secondary"}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                isCurrent ? "border-primary bg-primary text-surface" : done ? "border-primary text-primary" : "border-border"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            {t[step]}
            {done ? <span className="sr-only"> (hecho)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
