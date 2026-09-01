import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * La facturación del restaurante, vista por él (HU-25, RN-FIN-07).
 *
 * Quién puede ver esto no lo decide la pantalla: `client_can_view_billing()`
 * lo dice en el servidor —propietario local siempre, Editor solo con el
 * permiso explícito, Consulta nunca— y las políticas de `charges` filtran
 * las filas igual. Aquí se pregunta solo para poder explicar el motivo en
 * vez de enseñar una tabla vacía (CA-20).
 *
 * El autor de cada apunte llega como identificador desde
 * `establishment_consumption_ledger()`: al restaurante nunca se le
 * devuelve la persona del equipo, solo "equipo de mantenimiento".
 */
export const dynamic = "force-dynamic";

type ChargeStateKey = keyof typeof es.teamArea.chargeStates;
type CategoryKey = keyof typeof es.naming.categories;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function chargeTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid" || status === "waived") return "success";
  if (status === "overdue") return "danger";
  if (status === "partially_paid" || status === "refunded") return "warning";
  return "neutral";
}

export default async function ClientBillingPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code")
    .eq("id", id)
    .maybeSingle();

  if (!establishment) notFound();

  const { data: canViewBilling } = await supabase.rpc("client_can_view_billing", {
    p_establishment_id: id,
  });

  if (!canViewBilling) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.clientArea.billingTitle}</h1>
        <NoPermissionState
          title={es.clientArea.billingNoAccessTitle}
          description={es.clientArea.billingNoAccessReason}
        />
      </main>
    );
  }

  const [{ data: charges }, { data: ledger }] = await Promise.all([
    supabase
      .from("charges")
      .select("id, concept, total_cents, due_at")
      .eq("establishment_id", id)
      .order("due_at", { ascending: false }),
    supabase.rpc("establishment_consumption_ledger", { p_establishment_id: id }),
  ]);

  // El estado y la deuda viva los deriva el servidor de los apuntes
  // (RN-FIN-02 + RN-DAT-05). Aquí no se suma dinero.
  const chargeRows = await Promise.all(
    (charges ?? []).map(async (charge) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: charge.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
      ]);
      return { ...charge, status: status ?? "pending", outstanding: outstanding ?? 0 };
    }),
  );

  const ledgerRows = ledger ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {establishment.code} · {establishment.name}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.clientArea.billingTitle}</h1>
        <p className="text-sm text-text-secondary">{es.clientArea.billingSubtitle}</p>
      </header>

      <Card title={es.teamArea.finance.chargesTitle}>
        {chargeRows.length === 0 ? (
          <EmptyState
            title={es.clientArea.billingEmptyTitle}
            description={es.clientArea.billingEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.clientArea.billingConceptColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.billingTotalColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.billingDueColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.billingStatusColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.billingOutstandingColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {chargeRows.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>{charge.concept}</TableCell>
                  <TableCell>{euros(charge.total_cents)}</TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(charge.due_at),
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={chargeTone(charge.status)}>
                      {es.teamArea.chargeStates[charge.status as ChargeStateKey] ?? charge.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{euros(charge.outstanding)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <p className="mt-4 text-sm text-text-secondary">
          <strong className="font-semibold text-text">
            {es.clientArea.receiptPendingTitle}
          </strong>{" "}
          {es.clientArea.receiptPendingReason}
        </p>
      </Card>

      <Card title={es.clientArea.ledgerTitle}>
        {ledgerRows.length === 0 ? (
          <EmptyState
            title={es.clientArea.ledgerEmptyTitle}
            description={es.clientArea.ledgerEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.clientArea.ledgerDateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.ledgerCategoryColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.ledgerAmountColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.ledgerRequestColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.ledgerReasonColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ledgerRows.map((entry) => (
                <TableRow key={entry.entry_id}>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(entry.occurred_at),
                    )}
                  </TableCell>
                  <TableCell>
                    {es.naming.categories[entry.category as CategoryKey] ?? entry.category}
                  </TableCell>
                  <TableCell>
                    {entry.amount > 0 ? `+${entry.amount}` : String(entry.amount)}
                  </TableCell>
                  <TableCell>{entry.request_code ?? "—"}</TableCell>
                  <TableCell>{entry.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </main>
  );
}
