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
import { isSpaceRequestFinal, type SpaceRequestState } from "@/core/space-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { requestTone } from "./request-tone";

/**
 * Solicitudes de alta (§128, RN-ADM-05): las de §30, pendientes primero.
 * Se leen de `space_requests` con las columnas enumeradas —`decided_by`
 * está revocada (RN-PLA-07) y `select *` devolvería 403— y la política de
 * la 89 decide cuáles: la plataforma con permiso las ve todas menos los
 * borradores.
 */
export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("space_requests")
    .select("id, business_name, contact_name, email, plan, status, submitted_at, decided_at, created_at")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (error) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />;
  }

  const t = es.platformAdmin.requests;
  const filas = (data ?? []).slice().sort((a, b) => {
    const fa = isSpaceRequestFinal(a.status as SpaceRequestState) ? 1 : 0;
    const fb = isSpaceRequestFinal(b.status as SpaceRequestState) ? 1 : 0;
    return fa - fb;
  });

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
              <TableHeaderCell>{t.contact}</TableHeaderCell>
              <TableHeaderCell>{t.plan}</TableHeaderCell>
              <TableHeaderCell>{t.status}</TableHeaderCell>
              <TableHeaderCell>{t.submittedAt}</TableHeaderCell>
              <TableHeaderCell>
                  <span className="sr-only">{es.platformAdmin.requests.open}</span>
                </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map((row) => {
              const state = row.status as SpaceRequestState;
              return (
                <TableRow key={row.id}>
                  <TableCell>{row.business_name}</TableCell>
                  <TableCell>
                    {row.contact_name}
                    <span className="block text-xs text-text-secondary">{row.email}</span>
                  </TableCell>
                  <TableCell>{es.cuotlySubscription.plans[row.plan as "pro" | "agency"]}</TableCell>
                  <TableCell>
                    <StatusBadge tone={requestTone(state)}>{es.spaceRequestForm.states[state]}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    {row.submitted_at
                      ? enZona(row.submitted_at, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/administracion/solicitudes/${row.id}`} className="text-cuotly-green underline">
                      {t.open}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
