import { es } from "@/i18n/es";

/**
 * PRD §20.2 · entrada de menú "Agente Cuotly (Próximamente)".
 *
 * CLAUDE.md es explícito: "solo existe la entrada de menú con la etiqueta
 * Próximamente. Sin funcionalidad simulada." Así que esta pantalla dice
 * que no está y no finge nada: ni una demo, ni un campo de texto que no
 * responde, ni una lista de capacidades futuras que suene a compromiso.
 */
export default function AgentePage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{es.agent.title}</h1>
        <span
          data-testid="agent-badge"
          className="rounded bg-soft-surface px-2 py-0.5 text-xs text-text-secondary"
        >
          {es.agent.badge}
        </span>
      </div>
      <p className="mt-3 text-sm text-text-secondary">{es.agent.description}</p>
    </main>
  );
}
