import { cookies } from "next/headers";
import Link from "next/link";

import { redirect } from "next/navigation";

import { Button, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { loadDevice } from "@/services/agents/device";

import { forgetDeviceAction } from "../device-actions";
import { SUPPORT_RETURN_COOKIE, safeReturnPath } from "../support-return";

import { AgentsShell } from "../AgentsShell";
import { loadAgentsRestaurant } from "../agents-context";

/**
 * Un restaurante dentro de Restavor agents. Aquí se sabe cuál es y quién es quien mira, y
 * con eso el armazón pinta el menú de §5.1. Si no se puede entrar —no es de los suyos, aún
 * no tiene Reservas o no se ha podido mirar— se dice con su motivo y no se pinta nada más.
 */
export default async function AgentRestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = es.agents.selector;

  // Una cookie de dispositivo que ya no vale (se desactivó): se dice y se ofrece entrar con la cuenta.
  const device = await loadDevice();
  if (device.kind === "revoked") {
    const r = es.agents.device.revoked;
    return (
      <main className="mx-auto max-w-lg space-y-6 p-6">
        <EmptyState title={r.title} description={r.reason} />
        <form action={forgetDeviceAction}>
          <Button type="submit">{r.action}</Button>
        </form>
      </main>
    );
  }

  const restaurant = await loadAgentsRestaurant(id);

  // Soporte cuya sesión terminó: vuelve a donde vino (la ficha del espacio, o Administración).
  if (restaurant.state === "support_expired") {
    const back = safeReturnPath((await cookies()).get(SUPPORT_RETURN_COOKIE)?.value ?? "");
    redirect(back === "/" ? `/espacios/${restaurant.spaceSlug}/reservas` : back);
  }

  if (restaurant.state === "ok") {
    return <AgentsShell nav={restaurant.nav}>{children}</AgentsShell>;
  }

  // Una tablet solo es de su restaurante: si pide otro vuelve a Hoy en el suyo (sin sesión personal no hay otro sitio
  // al que mandarla ni cuenta con la que mirar).
  if (device.kind === "active" && restaurant.state === "no_access") {
    redirect(agentsPageHref(device.establishmentId, "today"));
  }

  return (
    <AgentsShell>
      <div className="space-y-6">
        <PageHeader title={es.agents.home.title} />
        {restaurant.state === "failed" ? (
          <ErrorState title={es.app.home.failedTitle} description={es.app.home.failedReason} />
        ) : restaurant.state === "not_contracted" ? (
          <EmptyState title={es.agents.home.emptyTitle} description={es.agents.home.emptyReason} />
        ) : (
          <EmptyState title={t.noAccessTitle} description={t.noAccessReason} />
        )}
        <Link href="/agents" className="text-sm font-medium text-cuotly-green hover:underline">
          {t.backToList}
        </Link>
      </div>
    </AgentsShell>
  );
}
