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
import { isAccessRequestFinal, type AccessRequestState } from "@/core/access-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { accessTone } from "./access-tone";

/**
 * PRD §37 (RN-ACC-06) · la bandeja de solicitudes de acceso, junto a la de
 * creación de espacio porque las decide el mismo permiso ("Aprobar
 * espacios", §167) y quien aprueba las quiere ver juntas.
 *
 * Las columnas van enumeradas: `decided_by`, `follow_up_token` e
 * `idempotency_key` están revocadas (RN-ACC-07) y un `select *` devolvería
 * 403. Quién decidió sale de la auditoría, no de aquí.
 */
export const dynamic = "force-dynamic";

export default async function AdminAccessRequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("access_requests")
    .select("id, business_name, contact_name, email, phone, status, created_at, account_id")
    .order("created_at", { ascending: false });

  if (error) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />;
  }

  const t = es.platformAdmin.access;
  const filas = (data ?? []).slice().sort((a, b) => {
    const fa = isAccessRequestFinal(a.status as AccessRequestState) ? 1 : 0;
    const fb = isAccessRequestFinal(b.status as AccessRequestState) ? 1 : 0;
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
              <TableHeaderCell>{t.email}</TableHeaderCell>
              <TableHeaderCell>{t.status}</TableHeaderCell>
              <TableHeaderCell>{t.createdAt}</TableHeaderCell>
              <TableHeaderCell> </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.id}>
                <TableCell>{fila.business_name}</TableCell>
                <TableCell>{fila.contact_name}</TableCell>
                <TableCell>{fila.email}</TableCell>
                <TableCell>
                  <StatusBadge tone={accessTone(fila.status as AccessRequestState)}>
                    {t.states[fila.status as AccessRequestState]}
                  </StatusBadge>
                </TableCell>
                <TableCell>{enZona(fila.created_at, CUOTLY_TIMEZONE, { dateStyle: "short" })}</TableCell>
                <TableCell>
                  <Link
                    href={`/administracion/accesos/${fila.id}`}
                    className="text-sm font-semibold text-cuotly-green underline"
                  >
                    {t.open}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
