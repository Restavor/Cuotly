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
import { enZona } from "@/i18n/dates";
import { PaymentHistory } from "@/components/finance/PaymentHistory";
import { loadChargePayments } from "@/services/charge-payments";

import { loadEstablishmentTimezone } from "../timezone-load";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ClientQuoteCard } from "./ClientQuoteCard";
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

  const [{ data: charges }, { data: ledger }, { data: quoteRows }, { data: canAnswerQuotes }, zona] =
    await Promise.all([
      supabase
        .from("charges")
        .select("id, concept, total_cents, due_at")
        .eq("establishment_id", id)
        .order("due_at", { ascending: false }),
      supabase.rpc("establishment_consumption_ledger", { p_establishment_id: id }),
      // §84 · los presupuestos del restaurante. `quotes_select` no le deja
      // ver borradores; las columnas se enumeran porque las de identidad
      // están revocadas (P7).
      supabase
        .from("quotes")
        .select(
          "id, code, concept, description, base_cents, tax_cents, total_cents, requires_payment_before_start, state, decided_by_team, decision_reason",
        )
        .eq("establishment_id", id)
        .order("created_at", { ascending: false }),
      // Quién responde a un presupuesto es quien acepta las condiciones:
      // el propietario local o el del grupo. Se PREGUNTA al servidor.
      supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
      // CLAUDE.md · la zona del espacio; el restaurante no lee `spaces`.
      loadEstablishmentTimezone(supabase, id),
    ]);

  const quotes = await Promise.all(
    (quoteRows ?? []).map(async (quote) => {
      const { data: status } = await supabase.rpc("quote_status", { p_quote_id: quote.id });
      return {
        id: quote.id,
        code: quote.code,
        concept: quote.concept,
        description: quote.description,
        baseCents: quote.base_cents,
        taxCents: quote.tax_cents,
        totalCents: quote.total_cents,
        // Si la derivación no contestó, el estado guardado: nunca se
        // inventa un "enviado" que ofrecería botones de responder.
        status: status ?? quote.state,
        requiresPaymentBeforeStart: quote.requires_payment_before_start,
        decidedByTeam: quote.decided_by_team,
        decisionReason: quote.decision_reason,
      };
    }),
  );

  // El estado y la deuda viva los deriva el servidor de los apuntes
  // (RN-FIN-02 + RN-DAT-05). Aquí no se suma dinero.
  const chargeRows = await Promise.all(
    (charges ?? []).map(async (charge) => {
      // M51 · con el estado y la deuda viene el libro de apuntes: el
      // restaurante que paga a plazos necesita ver qué se le ha apuntado,
      // no solo cuánto le falta.
      const [{ data: status }, { data: outstanding }, payments] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: charge.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
        loadChargePayments(supabase, charge.id),
      ]);
      return { ...charge, status: status ?? "pending", outstanding: outstanding ?? 0, payments };
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
                    {enZona(charge.due_at, zona, { dateStyle: "short" })}
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

      {/* M51 · los pagos parciales, uno a uno. Va aparte de la tabla y no
          dentro de ella porque lo que se lee aquí es una conversación sobre
          dinero —"el 12 te apunté 200 por Bizum"— y eso no cabe en una
          celda. Solo aparece si hay cobros: sin cobros no hay pagos de los
          que hablar, y la tabla de arriba ya dice por qué no los hay. */}
      {chargeRows.length === 0 ? null : (
        <Card title={es.teamArea.finance.paymentsTitle}>
          <ul className="space-y-4">
            {chargeRows.map((charge) => (
              <li key={charge.id}>
                <p className="mb-1 text-sm font-semibold text-text">{charge.concept}</p>
                <PaymentHistory payments={charge.payments} timezone={zona} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* §84 · los presupuestos, con sus dos botones cuando toca responder. */}
      <section aria-labelledby="presupuestos" className="space-y-4">
        <h2 id="presupuestos" className="text-lg font-semibold text-primary-dark">
          {es.quotesClient.title}
        </h2>
        {quotes.length === 0 ? (
          <Card>
            <EmptyState title={es.quotesClient.emptyTitle} description={es.quotesClient.emptyReason} />
          </Card>
        ) : (
          quotes.map((quote) => (
            <ClientQuoteCard key={quote.id} quote={quote} canAnswer={canAnswerQuotes === true} />
          ))
        )}
      </section>

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
                    {enZona(entry.occurred_at, zona, { dateStyle: "short" })}
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
