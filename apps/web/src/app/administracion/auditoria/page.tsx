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
import { auditChanges, auditListedChanges } from "@/core/audit";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { platformAudit, type PlatformAuditRow } from "@/services/platform-gateway";

/**
 * Actividad y auditoría (§128, RN-ADM-04): los apuntes de plataforma, o los
 * últimos de todos los espacios. Con la identidad del actor: es Cuotly
 * mirando su plataforma. Paginado, porque el libro solo crece (§20.7).
 */
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

function nombreDeAccion(action: string): string {
  const nombres = es.settings.auditActions as Readonly<Record<string, string>>;
  return nombres[action] ?? action;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ ambito?: string; pagina?: string }>;
}) {
  const { ambito, pagina } = await searchParams;
  const scope: "platform" | "all" = ambito === "todo" ? "all" : "platform";
  const paginaActual = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);
  const supabase = await createClient();

  let filas: readonly PlatformAuditRow[];
  try {
    filas = await platformAudit(supabase, scope, POR_PAGINA + 1, (paginaActual - 1) * POR_PAGINA);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  const t = es.platformAdmin.audit;
  const hayMas = filas.length > POR_PAGINA;
  const visibles = filas.slice(0, POR_PAGINA);
  const enlace = (p: number) => `/administracion/auditoria?ambito=${scope === "all" ? "todo" : "plataforma"}&pagina=${p}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/administracion/auditoria?ambito=plataforma"
          aria-current={scope === "platform" ? "page" : undefined}
          className={scope === "platform" ? "font-semibold text-primary-dark" : "text-cuotly-green underline"}
        >
          {t.scopePlatform}
        </Link>
        <Link
          href="/administracion/auditoria?ambito=todo"
          aria-current={scope === "all" ? "page" : undefined}
          className={scope === "all" ? "font-semibold text-primary-dark" : "text-cuotly-green underline"}
        >
          {t.scopeAll}
        </Link>
      </nav>

      {visibles.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.when}</TableHeaderCell>
              <TableHeaderCell>{t.space}</TableHeaderCell>
              <TableHeaderCell>{t.who}</TableHeaderCell>
              <TableHeaderCell>{t.what}</TableHeaderCell>
              <TableHeaderCell>{t.entity}</TableHeaderCell>
              <TableHeaderCell>{t.reason}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibles.map((row) => {
              const cambios = auditListedChanges(auditChanges(row.old_value, row.new_value));
              return (
                <TableRow key={row.id}>
                  <TableCell>{enZona(row.created_at, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" })}</TableCell>
                  <TableCell>{row.space_name ?? t.noSpace}</TableCell>
                  <TableCell>
                    {row.actor_email ?? t.system}
                    {row.support_session_id ? (
                      <span className="block">
                        <StatusBadge tone="info" icon="lock">
                          {t.inSupport}
                        </StatusBadge>
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {nombreDeAccion(row.action)}
                    {cambios.length > 0 ? (
                      <ul className="mt-1 text-xs text-text-secondary">
                        {cambios.slice(0, 4).map((c) => (
                          <li key={c.field}>
                            {c.field}: {c.before ?? "—"} → {c.after ?? "—"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {(es.settings.auditEntities as Readonly<Record<string, string>>)[row.entity_type] ??
                      row.entity_type}
                  </TableCell>
                  <TableCell>{row.reason ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <nav className="flex justify-between text-sm">
        {paginaActual > 1 ? (
          <Link href={enlace(paginaActual - 1)} className="text-cuotly-green underline">
            {t.previous}
          </Link>
        ) : (
          <span />
        )}
        {hayMas ? (
          <Link href={enlace(paginaActual + 1)} className="text-cuotly-green underline">
            {t.more}
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
