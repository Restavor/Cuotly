import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ExportForm } from "./ExportForm";

/**
 * §141, §123 · Exportación y conservación (RN-CIC-10). El propietario se
 * lleva su espacio entero en un archivo, y ve el rastro de lo que ya se
 * ha exportado —§139 nombra las "exportaciones" entre lo que la auditoría
 * registra como mínimo—.
 *
 * Lo que el archivo lleva dentro lo decide el servidor con la identidad
 * de quien exporta: la RLS elige las filas y el privilegio de columna
 * elige las columnas. Por eso el archivo del propietario **no** trae las
 * columnas de identidad revocadas, y sí trae `audit_log`, que es de donde
 * el equipo saca quién hizo qué (CLAUDE.md).
 *
 * **Lo que no está aquí:** la conservación. Cuánto se guarda cada cosa y
 * qué se conserva por obligación legal es del bloque legal (§170.1), que
 * sigue aplazado, y se dice en vez de inventarse.
 */
export const dynamic = "force-dynamic";

export default async function ExportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.spaceExport;

  const { data: canManage } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_space",
  });

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  // Columnas enumeradas, como en todo el proyecto.
  const { data: historial } = await supabase
    .from("space_exports")
    .select("id, scope, requested_at, table_count, row_count")
    .eq("space_id", space.id)
    .order("requested_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card title={t.spaceTitle} className="mb-6">
        <p className="mb-4 text-sm text-text-secondary">{t.spaceHint}</p>
        <ExportForm spaceId={space.id} scope="space" label={t.submit} />
      </Card>

      <Card title={t.historyTitle} className="mb-6">
        {historial === null || historial.length === 0 ? (
          <EmptyState title={t.historyEmptyTitle} description={t.historyEmptyReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.historyWhen}</TableHeaderCell>
                <TableHeaderCell>{t.historyScope}</TableHeaderCell>
                <TableHeaderCell>{t.historySize}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historial.map((fila) => (
                <TableRow key={fila.id}>
                  <TableCell>
                    {enZona(fila.requested_at, space.timezone, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>{t.scopes[fila.scope as "space" | "group" | "establishment"]}</TableCell>
                  <TableCell>{t.historyCounts(fila.table_count, fila.row_count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* El placeholder del bloque legal, dicho y no fingido (§170.1). */}
      <Card title={t.retentionTitle}>
        <p className="text-sm text-text-secondary">{t.retentionPending}</p>
      </Card>
    </div>
  );
}
