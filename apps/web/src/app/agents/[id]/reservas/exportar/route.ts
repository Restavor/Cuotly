import { NextResponse } from "next/server";

import { loadAgentsRestaurant } from "@/app/agents/agents-context";
import { canReservations } from "@/core/reservations/permissions";
import { localDateOf } from "@/core/reservations/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadServiceDates } from "@/services/agents/billing-gateway";
import { exportBook, ExportTooLargeError, loadAllReservations } from "@/services/agents/reservations-export";
import { XLSX_CONTENT_TYPE } from "@/services/agents/xlsx";

/**
 * Descargar todas las reservas en Excel (COB-02; PRD de agents §6.13 y §11.1): el Propietario, cuando quiera
 * y también con Reservas cerrada (sus 30 días de descarga), y el soporte de Restavor dentro de una sesión de
 * soporte. El Encargado, el Equipo y la tablet del local no (PRD §3.2).
 *
 * La comprobación es de aquí y también de la base de datos: lee con la sesión de quien descarga, así que RLS
 * devuelve cero filas a quien no es del restaurante, y la descarga deja su huella en la auditoría (quién y
 * cuántas filas, nunca los datos). Una descarga no se guarda en ninguna caché.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const restaurant = await loadAgentsRestaurant(id);
  if (restaurant.state === "failed") {
    // Sin sesión no se puede ni mirar quién es: eso es «hace falta entrar», no un fallo nuestro.
    const { data } = await (await createClient()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Hace falta entrar" }, { status: 401, headers: NO_STORE });
    return NextResponse.json({ error: es.agents.billing.failedReason }, { status: 500, headers: NO_STORE });
  }
  // Un restaurante que no existe, que no es suyo o que aún no tiene Reservas: no se distingue.
  if (restaurant.state !== "ok") return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });

  const { nav, mode } = restaurant;
  if (mode === "device" || !canReservations(nav.actor, "export_all_reservations", { serviceStatus: nav.serviceStatus })) {
    return NextResponse.json({ error: "No tienes permiso para descargar las reservas" }, { status: 403, headers: NO_STORE });
  }

  const client = await createClient();
  try {
    const dates = await loadServiceDates(client, id);
    // La zona manda el restaurante: sin ella no se pinta una hora inventada.
    if (!dates) return NextResponse.json({ error: es.agents.billing.failedReason }, { status: 500, headers: NO_STORE });

    const rows = await loadAllReservations(client, id);
    const { error } = await client.rpc("audit_reservations_export", { p_establishment_id: id, p_rows: rows.length });
    if (error) {
      // Sin huella en la auditoría no se entregan datos personales.
      return NextResponse.json({ error: "No tienes permiso para descargar las reservas" }, { status: 403, headers: NO_STORE });
    }

    const book = exportBook(rows, dates.timeZone);
    const file = es.agents.billing.export.fileName(localDateOf(new Date(), dates.timeZone));
    return new NextResponse(book as unknown as BodyInit, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${file}"`,
        ...NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413, headers: NO_STORE });
    }
    return NextResponse.json({ error: es.agents.billing.failedReason }, { status: 500, headers: NO_STORE });
  }
}
