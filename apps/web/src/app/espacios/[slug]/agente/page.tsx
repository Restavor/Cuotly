import { ButtonLink } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * PRD §20.2 · entrada de menú "Agente Cuotly (Próximamente)".
 *
 * CLAUDE.md es explícito: "solo existe la entrada de menú con la etiqueta
 * Próximamente. Sin funcionalidad simulada." Así que esta pantalla dice
 * que no está y no finge nada: ni una demo, ni un campo de texto que no
 * responde, ni una lista de capacidades futuras que suene a compromiso.
 *
 * La composición es la del diseño (PDF móvil, p. 99): el icono del menú,
 * el nombre, la etiqueta y una sola salida, de vuelta al Inicio.
 */
export default async function AgentePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center sm:py-16">
      <span
        aria-hidden="true"
        className="flex h-20 w-20 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green"
      >
        <Icon name="agent" className="h-9 w-9" />
      </span>
      <h1 className="mt-5 text-[22px] font-bold text-primary-dark sm:text-2xl">{es.agent.title}</h1>
      <span
        data-testid="agent-badge"
        className="mt-3 rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-text"
      >
        {es.agent.badge}
      </span>
      <p className="mt-4 text-sm text-text-secondary">{es.agent.description}</p>
      <ButtonLink href={`/espacios/${slug}`} variant="outline" icon="home" className="mt-6">
        {es.agent.backHome}
      </ButtonLink>
    </div>
  );
}
