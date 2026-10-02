import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

export type AgentCardState = "on" | "off";

/**
 * La tarjeta de estado del agente de llamadas (PRD de agents §7.1, `AgentsAgente` y
 * `AgentsEncenderApagar`): verde y «Agente encendido» con el auricular, o gris y
 * «Agente apagado» con el icono de apagado. Es solo presentación: el botón de encender
 * o apagar (`action`) y la ventana «¿Hasta cuándo?» son de la Fase G, y quién puede
 * pulsarlo lo decide el servidor.
 *
 * El estado se dice con texto e icono además del color (PRD §21.4).
 */
export function AgentStateCard({
  state,
  title,
  description,
  action,
}: {
  state: AgentCardState;
  /** Sustituye al título por defecto: «Agente apagado hasta las 15:10». */
  title?: string;
  /** La línea de detalle, ya redactada: cómo le llegan las llamadas, el horario, lo de hoy. */
  description?: string;
  /** El botón de encender o apagar. */
  action?: ReactNode;
}) {
  const on = state === "on";
  return (
    <section
      data-agent-state={state}
      aria-label={es.agents.components.agentCard[state]}
      className={`flex flex-wrap items-center gap-4 rounded-card border px-5 py-[18px] ${
        on ? "border-agent-on-border bg-agent-on-bg" : "border-agent-off-border bg-agent-off-bg"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-surface ${
          on ? "bg-primary" : "bg-status-muted"
        }`}
      >
        <Icon name={on ? "headset" : "power"} className="h-[26px] w-[26px]" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className={`text-xl font-semibold ${on ? "text-primary-dark" : "text-text"}`}>
          {title ?? es.agents.components.agentCard[state]}
        </h2>
        {description ? <p className="text-sm text-agent-off-text">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}

/**
 * El indicador de la cabecera de Hoy: una píldora «Agente encendido» o «Agente apagado ·
 * hasta 15:10» que lleva a la tarjeta (PRD de agents §7.1). El texto lo redacta quien la
 * pinta.
 */
export function AgentStatusPill({
  state,
  children,
}: {
  state: AgentCardState;
  children?: ReactNode;
}) {
  const on = state === "on";
  return (
    <span
      data-agent-pill={state}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
        on
          ? "border-agent-on-border bg-agent-on-bg text-agent-on-text"
          : "border-agent-off-border bg-agent-off-bg text-agent-off-text"
      }`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${on ? "bg-success" : "bg-status-muted"}`} />
      {children ?? es.agents.components.agentCard[state]}
    </span>
  );
}
