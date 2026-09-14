import Link from "next/link";

import {
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import type { ReportState } from "@/core/reports";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

import type { ReportRow } from "./reports-load";

const t = es.reportsPage;

/**
 * La tabla de la vista 10.01, con las columnas que dibuja: nombre,
 * restaurante, categoría, periodo, estado y fecha de creación.
 *
 * El estado se pinta con insignia **y** texto, nunca solo con color
 * (§21.4): las seis de §95 no se distinguen por el tinte.
 */
const TONO: Readonly<Record<ReportState, "info" | "warning" | "success" | "neutral">> = {
  preparing: "info",
  pending_review: "warning",
  approved: "success",
  scheduled: "info",
  sent: "success",
  archived: "neutral",
};

const ICONO: Readonly<Record<ReportState, "document" | "alert" | "check" | "clock">> = {
  preparing: "document",
  pending_review: "alert",
  approved: "check",
  scheduled: "clock",
  sent: "check",
  archived: "document",
};

export function ReportStateBadge({ status }: { status: ReportState }) {
  return (
    <StatusBadge tone={TONO[status]} icon={ICONO[status]}>
      {t.states[status]}
    </StatusBadge>
  );
}

export function periodLabel(row: { readonly periodStart: string; readonly periodEnd: string }): string {
  return `${fechaCorta(row.periodStart)} – ${fechaCorta(row.periodEnd)}`;
}

export function ReportsTable({ rows, base }: { rows: readonly ReportRow[]; base: string }) {
  if (rows.length === 0) {
    return <EmptyState icon="document" title={t.empty} description={t.emptyReason} />;
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{t.columns.name}</TableHeaderCell>
          <TableHeaderCell>{t.columns.establishment}</TableHeaderCell>
          <TableHeaderCell>{t.columns.category}</TableHeaderCell>
          <TableHeaderCell>{t.columns.period}</TableHeaderCell>
          <TableHeaderCell>{t.columns.state}</TableHeaderCell>
          <TableHeaderCell>{t.columns.createdAt}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link className="font-semibold text-primary-dark underline" href={`${base}/${row.id}`}>
                {row.name}
              </Link>
            </TableCell>
            <TableCell>{row.establishmentName ?? t.pdf.consolidated}</TableCell>
            <TableCell>{t.categories[row.category]}</TableCell>
            <TableCell>{periodLabel(row)}</TableCell>
            <TableCell>
              <ReportStateBadge status={row.status} />
            </TableCell>
            <TableCell>{fechaCorta(row.createdAt.slice(0, 10))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
