import Link from "next/link";

import {
  EmptyState,
  ErrorState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { type IncidentPriority, isIncidentState } from "@/core/support";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { platformListIncidents, type PlatformIncidentRow } from "@/services/support-gateway";

import { priorityTone, stateTone } from "./tone";

/**
 * La bandeja de Cuotly (§131, RN-SOP-07, RN-SOP-15): lo que los espacios le
 * han abierto, por prioridad —crítica, alta, estándar— y después por
 * antigüedad. Las sugerencias van al final: no tienen prioridad
 * (RN-SOP-02). `?todas=1` enseña también las cerradas.
 *
 * El orden lo da `platform_list_incidents()`, no esta pantalla: aquí solo
 * se pinta lo que llega.
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null): string {
  return value === null ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

function prioridad(row: PlatformIncidentRow): string {
  return row.priority === null
    ? es.incidents.noPriority
    : es.incidents.priorities[row.priority as IncidentPriority];
}

export default async function AdminIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ todas?: string }>;
}) {
  const { todas } = await searchParams;
  const soloAbiertas = todas !== "1";
  const supabase = await createClient();

  let rows: readonly PlatformIncidentRow[];
  try {
    rows = await platformListIncidents(supabase, soloAbiertas);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  const t = es.platformAdmin.incidents;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
          <p className="text-sm text-text-secondary">{t.subtitle}</p>
        </div>
        <Link
          href={soloAbiertas ? "/administracion/incidencias?todas=1" : "/administracion/incidencias"}
          className="text-sm text-cuotly-green underline"
        >
          {soloAbiertas ? t.showAll : t.showOpen}
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.priority}</TableHeaderCell>
              <TableHeaderCell>{t.space}</TableHeaderCell>
              <TableHeaderCell>{t.kind}</TableHeaderCell>
              <TableHeaderCell>{t.category}</TableHeaderCell>
              <TableHeaderCell>{t.status}</TableHeaderCell>
              <TableHeaderCell>{t.openedAt}</TableHeaderCell>
              <TableHeaderCell>{t.attention}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <StatusBadge tone={priorityTone(row.priority as IncidentPriority | null)}>{prioridad(row)}</StatusBadge>
                </TableCell>
                <TableCell>
                  <Link href={`/administracion/incidencias/${row.id}`} className="font-semibold text-primary-dark underline">
                    {row.space_name}
                  </Link>
                  <span className="block max-w-xs truncate text-xs text-text-secondary">{row.description}</span>
                </TableCell>
                <TableCell>{es.incidents.kinds[row.kind]}</TableCell>
                <TableCell>
                  {es.incidents.categories[row.category as keyof typeof es.incidents.categories] ?? row.category}
                </TableCell>
                <TableCell>
                  {isIncidentState(row.status) ? (
                    <StatusBadge tone={stateTone(row.status)}>{es.incidents.states[row.status]}</StatusBadge>
                  ) : (
                    row.status
                  )}
                </TableCell>
                <TableCell>{cuando(row.opened_at)}</TableCell>
                <TableCell>
                  <span className="text-xs text-text-secondary">
                    {row.kind === "error" ? t.firstResponse(row.first_response_minutes) : "—"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-text-secondary">{t.attentionHint}</p>
    </div>
  );
}
