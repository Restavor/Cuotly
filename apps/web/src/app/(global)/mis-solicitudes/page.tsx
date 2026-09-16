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
import type { SpaceRequestState } from "@/core/space-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { requestTone } from "../../administracion/solicitudes/request-tone";

/**
 * G04 · Mis solicitudes (RN-GLO-04).
 *
 * Son las de **creación de espacio** (§10, RN-PLA-01), y la pantalla lo
 * dice en su propio texto para que nadie busque aquí las de trabajo, que
 * viven dentro de cada espacio o panel.
 *
 * Las columnas van enumeradas: `decided_by` está revocada (RN-PLA-07) y un
 * `select *` devolvería 403. Quién la revisó no se enseña, y también se
 * dice: callarlo sin explicarlo parece un descuido.
 */
export const dynamic = "force-dynamic";

export default async function MyRequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("space_requests")
    .select("id, business_name, plan, status, status_reason, submitted_at, updated_at, created_at")
    .order("updated_at", { ascending: false });

  const t = es.globalContext.requests;

  if (error) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />;
  }

  const filas = data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      {filas.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.business}</TableHeaderCell>
              <TableHeaderCell>{t.plan}</TableHeaderCell>
              <TableHeaderCell>{t.status}</TableHeaderCell>
              <TableHeaderCell>{t.updated}</TableHeaderCell>
              <TableHeaderCell>{t.action}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map((fila) => {
              const estado = fila.status as SpaceRequestState;
              return (
                <TableRow key={fila.id}>
                  <TableCell>{fila.business_name}</TableCell>
                  <TableCell>
                    {es.cuotlySubscription.plans[fila.plan as "pro" | "agency"]}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={requestTone(estado)}>
                      {es.spaceRequestForm.states[estado]}
                    </StatusBadge>
                    {fila.status_reason ? (
                      <span className="mt-1 block text-sm text-text-secondary">
                        {fila.status_reason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {enZona(fila.updated_at, CUOTLY_TIMEZONE, { dateStyle: "short" })}
                  </TableCell>
                  <TableCell>
                    <Link
                      href="/solicitar-espacio"
                      className="text-sm font-semibold text-cuotly-green underline"
                    >
                      {t.actions[estado]}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="text-sm text-text-secondary">{t.reviewerHidden}</p>
      <p className="text-sm text-text-secondary">{es.globalContext.home.requestsElsewhere}</p>

      <Link
        href="/solicitar-espacio"
        className="inline-flex items-center justify-center rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {t.newRequest}
      </Link>
    </div>
  );
}
