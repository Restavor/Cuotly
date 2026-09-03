import { notFound, redirect } from "next/navigation";

import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
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
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Panel financiero del equipo (HU-26, HU-28, PRD §17.2).
 *
 * CA-03 — "un trabajador no puede ver finanzas globales" — no se cumple
 * escondiendo esta pantalla: `financial_dashboard()` lanza una excepción a
 * quien no tenga `manage_finance`. Aquí se traduce esa negativa a un
 * estado "sin acceso", que es lo que ve un trabajador que llegue por URL.
 */
export const dynamic = "force-dynamic";

type ChargeStateKey = keyof typeof es.teamArea.chargeStates;
type StageKey = keyof typeof es.teamArea.dunningStages;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function chargeTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid" || status === "waived") return "success";
  if (status === "overdue") return "danger";
  if (status === "partially_paid" || status === "refunded") return "warning";
  return "neutral";
}

export default async function FinancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  // El día que propone el formulario es hoy **en la zona del espacio**, no
  // en UTC ni en la del navegador (CLAUDE.md MUST).
  const hoy = todayInTimeZone(new Date(), space.timezone);

  // Últimos 12 meses: un periodo declarado, no una ventana inventada por
  // la pantalla según lo que haya (P6).
  const to = new Date();
  const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());

  const { data: dashboard, error: dashboardError } = await supabase.rpc("financial_dashboard", {
    p_space_id: space.id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (dashboardError) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.finance.title}</h1>
        <NoPermissionState
          title={es.teamArea.finance.noPermissionTitle}
          description={es.teamArea.finance.noPermissionReason}
        />
      </div>
    );
  }

  const totals = dashboard?.[0];

  const [{ data: charges }, { data: nonpayment }, { data: establishments }] = await Promise.all([
    supabase
      .from("charges")
      .select("id, concept, establishment_id, total_cents, due_at")
      .eq("space_id", space.id)
      .gte("issued_at", from.toISOString())
      .order("due_at", { ascending: false }),
    supabase.rpc("establishments_with_nonpayment", { p_space_id: space.id }),
    supabase.from("establishments").select("id, name").eq("space_id", space.id),
  ]);

  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));

  // El estado y la deuda viva de cada cobro los deriva el servidor de su
  // libro de apuntes (RN-FIN-02 + RN-DAT-05): aquí no se suman importes.
  const chargeRows = await Promise.all(
    (charges ?? []).map(async (charge) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: charge.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
      ]);
      return { ...charge, status: status ?? "pending", outstanding: outstanding ?? 0 };
    }),
  );

  // HU-26 · los justificantes ya adjuntos a cada cobro. Salen de
  // `file_links` y no de `receipts` para que sea `can_read_file()` quien
  // decida: así, si algún día llega a esta pantalla alguien que no debe ver
  // facturación, no ve tampoco los archivos (RN-ARC-05).
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
    ? await supabase.from("files").select("id, name").in("id", fileIds)
    : { data: [] };

  const fileById = new Map((attachedFiles ?? []).map((file) => [file.id, file]));
  const receiptsByCharge = new Map<string, { id: string; name: string }[]>();
  for (const link of links ?? []) {
    const file = fileById.get(link.file_id);
    if (!file) continue;
    receiptsByCharge.set(link.entity_id, [
      ...(receiptsByCharge.get(link.entity_id) ?? []),
      { id: file.id, name: file.name },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.teamArea.finance.title}</h1>
        <p className="text-sm text-text-secondary">{es.teamArea.finance.subtitle}</p>
      </header>

      {totals ? (
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              [es.teamArea.finance.forecastLabel, totals.forecast_total_cents],
              [es.teamArea.finance.collectedLabel, totals.collected_cents],
              [es.teamArea.finance.pendingLabel, totals.pending_cents],
              [es.teamArea.finance.overdueLabel, totals.overdue_cents],
              [es.teamArea.finance.recurringLabel, totals.recurring_monthly_total_cents],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-soft-surface p-3">
                <dt className="text-xs text-text-secondary">{label}</dt>
                <dd className="text-lg font-semibold text-primary-dark">
                  {euros(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card title={es.teamArea.finance.chargesTitle}>
        {chargeRows.length === 0 ? (
          <EmptyState
            title={es.teamArea.finance.chargesEmptyTitle}
            description={es.teamArea.finance.chargesEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.finance.conceptColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.totalColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.dueColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.statusColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.receiptColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.registerTitle}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {chargeRows.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell>{charge.concept}</TableCell>
                  <TableCell>{establishmentName.get(charge.establishment_id) ?? "—"}</TableCell>
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
                  <TableCell>
                    {(receiptsByCharge.get(charge.id) ?? []).length === 0 ? (
                      <span className="text-text-secondary">{es.teamArea.finance.receiptNone}</span>
                    ) : (
                      <ul className="space-y-1">
                        {(receiptsByCharge.get(charge.id) ?? []).map((file) => (
                          <li key={file.id}>
                            {/* RN-ARC-08: enlace privado y temporal, firmado
                                tras comprobar `can_read_file()`. */}
                            <a
                              href={`/api/archivos/${file.id}`}
                              className="text-cuotly-green underline"
                            >
                              {file.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    {charge.outstanding > 0 ? (
                      <RegisterPaymentForm
                        chargeId={charge.id}
                        establishmentId={charge.establishment_id}
                        outstandingEuros={(charge.outstanding / 100).toFixed(2)}
                        defaultDay={hoy}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card title={es.teamArea.finance.nonpaymentTitle}>
        {(nonpayment ?? []).length === 0 ? (
          <EmptyState
            title={es.teamArea.finance.nonpaymentEmptyTitle}
            description={es.teamArea.finance.nonpaymentEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.finance.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.oldestDueColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.outstandingColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.finance.stageColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(nonpayment ?? []).map((row) => (
                <TableRow key={row.establishment_id}>
                  <TableCell>{row.establishment_name}</TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(row.oldest_due_at),
                    )}
                  </TableCell>
                  <TableCell>{euros(Number(row.outstanding_cents))}</TableCell>
                  <TableCell>
                    <StatusBadge tone={row.stage === "suspended" ? "danger" : "warning"}>
                      {es.teamArea.dunningStages[row.stage as StageKey] ?? row.stage}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
