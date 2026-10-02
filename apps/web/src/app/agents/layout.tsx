/**
 * Restavor agents (decisión 89). El armazón (`AgentsShell`) lo pinta cada página de
 * primer nivel: `/agents` (el selector, sin restaurante) y `/agents/[id]` (con el
 * restaurante elegido, que es quien conoce su `id`). Un layout no ve los parámetros de
 * sus hijos, y el menú necesita saber en qué restaurante se está.
 */
export const dynamic = "force-dynamic";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
