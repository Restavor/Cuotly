import { NextResponse } from "next/server";

import { loadAgentsRestaurant } from "@/app/agents/agents-context";
import { localDateOf } from "@/core/reservations/dates";
import { canReservations } from "@/core/reservations/permissions";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { movementsBook } from "@/services/agents/balance-export";
import { loadAllMovements } from "@/services/agents/balance-gateway";
import { loadServiceDates } from "@/services/agents/billing-gateway";
import { XLSX_CONTENT_TYPE } from "@/services/agents/xlsx";

/**
 * Descargar los movimientos del saldo en Excel (SAL-01; PRD de agents §5.2): el Propietario, el Encargado, Restavor
 * y el soporte en sesión, los mismos que ven el saldo. La tablet del local no.
 *
 * La comprobación es de aquí y también de la base de datos: lee con la sesión de quien descarga, así que RLS devuelve
 * cero filas a quien no es del restaurante. No es una pantalla (no está en `AGENTS_PAGES`): por eso comprueba el
 * permiso por su cuenta. No se guarda en ninguna caché.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const restaurant = await loadAgentsRestaurant(id);
  if (restaurant.state === "failed") {
    const { data } = await (await createClient()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Hace falta entrar" }, { status: 401, headers: NO_STORE });
    return NextResponse.json({ error: es.agents.billing.failedReason }, { status: 500, headers: NO_STORE });
  }
  if (restaurant.state !== "ok") return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });

  const { nav, mode } = restaurant;
  if (mode === "device" || !canReservations(nav.actor, "view_balance", { serviceStatus: nav.serviceStatus })) {
    return NextResponse.json({ error: "No tienes permiso para descargar el saldo" }, { status: 403, headers: NO_STORE });
  }

  const client = await createClient();
  try {
    const dates = await loadServiceDates(client, id);
    if (!dates) return NextResponse.json({ error: es.agents.billing.failedReason }, { status: 500, headers: NO_STORE });
    const movements = await loadAllMovements(client, id);
    const book = movementsBook(movements, dates.timeZone);
    const file = es.agents.balance.export.fileName(localDateOf(new Date(), dates.timeZone));
    return new NextResponse(book as unknown as BodyInit, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${file}"`,
        ...NO_STORE,
      },
    });
  } catch {
    return NextResponse.json({ error: es.agents.billing.failedReason }, { status: 500, headers: NO_STORE });
  }
}
