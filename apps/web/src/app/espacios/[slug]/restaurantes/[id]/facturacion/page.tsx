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

import { UploadReceiptForm } from "./UploadReceiptForm";

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
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.clientArea.billingTitle}</h1>
        <NoPermissionState
          title={es.clientArea.billingNoAccessTitle}
          description={es.clientArea.billingNoAccessReason}
        />
      </div>
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

  // RN-FIN-06 · los justificantes que este restaurante puede ver. No salen
  // de `receipts` —esa tabla es del equipo: su política es
  // `can_read_establishment_finance()`, que al cliente lo deja fuera— sino
  // de `file_links`, cuya política es `can_read_file()`. Así el cliente ve
  // lo suyo y sigue sin ver lo que el equipo adjuntó como interno.
  const chargeIds = chargeRows.map((charge) => charge.id);
  const { data: links } = chargeIds.length
    ? await supabase
        .from("file_links")
        .select("file_id, entity_id")
        .eq("entity_type", "charge")
        .in("entity_id", chargeIds)
    : { data: [] };

  const fileIds = [...new Set((links ?? []).map((link) => link.file_id))];
  const { data: attachedFiles } = fileIds.length
    ? await supabase.from("files").select("id, name, created_at").in("id", fileIds)
    : { data: [] };

  const fileById = new Map((attachedFiles ?? []).map((file) => [file.id, file]));
  const receiptsByCharge = new Map<string, { id: string; name: string }[]>();
  for (const link of links ?? []) {
    const file = fileById.get(link.file_id);
    if (!file) continue;
    const lista = receiptsByCharge.get(link.entity_id) ?? [];
    lista.push({ id: file.id, name: file.name });
    receiptsByCharge.set(link.entity_id, lista);
  }

  // Solo tiene sentido adjuntar a un cobro con deuda viva.
  const chargesPendientes = chargeRows
    .filter((charge) => charge.outstanding > 0)
    .map((charge) => ({
      id: charge.id,
      label: `${charge.concept} · ${euros(charge.outstanding)}`,
    }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
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

      </Card>

      <Card title={es.clientArea.receiptTitle}>
        {chargesPendientes.length === 0 ? (
          <p className="text-sm text-text-secondary">{es.clientArea.receiptNothingToSend}</p>
        ) : (
          <UploadReceiptForm establishmentId={id} charges={chargesPendientes} />
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-text">
            {es.clientArea.receiptSentTitle}
          </h3>
          {receiptsByCharge.size === 0 ? (
            <p className="text-sm text-text-secondary">{es.clientArea.receiptSentEmpty}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {chargeRows.flatMap((charge) =>
                (receiptsByCharge.get(charge.id) ?? []).map((file) => (
                  <li key={file.id}>
                    <span className="text-text-secondary">{charge.concept} · </span>
                    {/*
                      RN-ARC-08: el enlace no es al objeto, es a una ruta que
                      comprueba `can_read_file()` y firma una URL de unos
                      minutos. No hay URL permanente de ningún archivo.
                    */}
                    <a href={`/api/archivos/${file.id}`} className="text-cuotly-green underline">
                      {file.name}
                    </a>
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
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
    </div>
  );
}
