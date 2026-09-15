import Link from "next/link";

import {
  Card,
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
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  listSupportSessions,
  supportSessionActions,
  type SupportActionRow,
  type SupportSessionRow,
} from "@/services/platform-gateway";

import { EndSupportForm } from "./EndSupportForm";

/**
 * Soporte (§128, §129): cada sesión de Modo soporte, abierta o pasada, con
 * quién, dónde, por qué, con qué nivel, desde y hasta cuándo, y las
 * acciones que dejó (RN-ADM-08). `?sesion=<id>` despliega las acciones de
 * una: son los apuntes de `audit_log` con su `support_session_id`.
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null): string {
  return value === null ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

function nombreDeAccion(action: string): string {
  const nombres = es.settings.auditActions as Readonly<Record<string, string>>;
  return nombres[action] ?? action;
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ sesion?: string }>;
}) {
  const { sesion } = await searchParams;
  const supabase = await createClient();

  let sessions: readonly SupportSessionRow[];
  let acciones: readonly SupportActionRow[] = [];
  try {
    sessions = await listSupportSessions(supabase);
    if (sesion) acciones = await supportSessionActions(supabase, sesion);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  const t = es.platformAdmin.support;
  const seleccionada = sesion ? sessions.find((s) => s.id === sesion) : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      {sessions.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.space}</TableHeaderCell>
              <TableHeaderCell>{t.who}</TableHeaderCell>
              <TableHeaderCell>{t.reason}</TableHeaderCell>
              <TableHeaderCell>{t.level}</TableHeaderCell>
              <TableHeaderCell>{t.started}</TableHeaderCell>
              <TableHeaderCell>{t.expires}</TableHeaderCell>
              <TableHeaderCell>{t.actions}</TableHeaderCell>
              <TableHeaderCell>
                  <span className="sr-only">{es.platformAdmin.spaces.actions}</span>
                </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {s.space_name}
                  <span className="block text-xs text-text-secondary">/{s.space_slug}</span>
                </TableCell>
                <TableCell>{s.actor_email}</TableCell>
                <TableCell>{s.reason}</TableCell>
                <TableCell>{t.levels[s.access_level]}</TableCell>
                <TableCell>{cuando(s.started_at)}</TableCell>
                <TableCell>
                  {s.is_active ? (
                    <StatusBadge tone="info" icon="lock">
                      {t.active} · {cuando(s.expires_at)}
                    </StatusBadge>
                  ) : s.ended_at ? (
                    <>
                      {t.ended} {cuando(s.ended_at)}
                      {s.end_note ? <span className="block text-xs text-text-secondary">{s.end_note}</span> : null}
                    </>
                  ) : (
                    `${t.expired} ${cuando(s.expires_at)}`
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/administracion/soporte?sesion=${s.id}`} className="text-cuotly-green underline">
                    {s.actions_count} · {t.viewActions}
                  </Link>
                </TableCell>
                <TableCell>
                  {s.is_active ? (
                    <div className="flex flex-col gap-2">
                      <Link href={`/espacios/${s.space_slug}`} className="text-sm text-cuotly-green underline">
                        {t.enter}
                      </Link>
                      <EndSupportForm sessionId={s.id} />
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {seleccionada ? (
        <Card title={`${t.actionsTitle} · ${seleccionada.space_name} · ${seleccionada.actor_email}`}>
          {acciones.length === 0 ? (
            <EmptyState title={t.actionsEmptyTitle} description={t.actionsEmptyReason} />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.platformAdmin.audit.when}</TableHeaderCell>
                  <TableHeaderCell>{es.platformAdmin.audit.what}</TableHeaderCell>
                  <TableHeaderCell>{es.platformAdmin.audit.entity}</TableHeaderCell>
                  <TableHeaderCell>{es.platformAdmin.audit.reason}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {acciones.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{cuando(a.created_at)}</TableCell>
                    <TableCell>{nombreDeAccion(a.action)}</TableCell>
                    <TableCell>
                      {(es.settings.auditEntities as Readonly<Record<string, string>>)[a.entity_type] ??
                        a.entity_type}
                    </TableCell>
                    <TableCell>{a.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
