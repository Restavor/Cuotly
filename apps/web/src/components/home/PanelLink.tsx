import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

/** El "Ver todas →" de la cabecera de un panel del Inicio. */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 rounded text-sm font-medium text-cuotly-green hover:underline focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      {children}
      <Icon name="arrowRight" className="h-4 w-4" />
    </Link>
  );
}
