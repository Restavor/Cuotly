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
import { canNamePlatformAdmins } from "@/core/platform-admin";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { listUsers, myPlatformAccess, type PlatformUserRow } from "@/services/platform-gateway";

import { PlatformAdminForm } from "./PlatformAdminForm";

/**
 * Usuarios (§128): cada cuenta, sus espacios y si tiene la 2FA; y, para
 * Bosco, nombrar o retirar Administradores de Cuotly (RN-ADM-03). El
 * formulario se pinta solo a Bosco por cortesía: `set_platform_admin()`
 * vuelve a comprobarlo.
 */
export const dynamic = "force-dynamic";

function rol(row: PlatformUserRow): string {
  if (row.is_owner) return es.platformAdmin.users.owner;
  if (row.is_admin) return es.platformAdmin.users.admin;
  return es.platformAdmin.users.nobody;
}

export default async function AdminUsersPage() {
  const supabase = await createClient();

  let users: readonly PlatformUserRow[];
  let bosco = false;
  try {
    const [rows, access] = await Promise.all([listUsers(supabase), myPlatformAccess(supabase)]);
    users = rows;
    bosco = canNamePlatformAdmins(access);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  const t = es.platformAdmin.users;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
        {!bosco ? <p className="mt-1 text-sm text-text-secondary">{t.notOwnerHint}</p> : null}
      </header>

      {users.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.email}</TableHeaderCell>
              <TableHeaderCell>{t.name}</TableHeaderCell>
              <TableHeaderCell>{t.spaces}</TableHeaderCell>
              <TableHeaderCell>{t.role}</TableHeaderCell>
              <TableHeaderCell>{t.twoFactor}</TableHeaderCell>
              <TableHeaderCell>{t.createdAt}</TableHeaderCell>
              {bosco ? <TableHeaderCell>{t.manageTitle}</TableHeaderCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.email}</TableCell>
                <TableCell>{row.full_name ?? "—"}</TableCell>
                <TableCell>{row.spaces_count}</TableCell>
                <TableCell>{rol(row)}</TableCell>
                <TableCell>
                  {row.two_factor_enrolled ? (
                    <StatusBadge tone="success" icon="check">
                      {t.twoFactorYes}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">{t.twoFactorNo}</StatusBadge>
                  )}
                </TableCell>
                <TableCell>{enZona(row.created_at, CUOTLY_TIMEZONE, { dateStyle: "short" })}</TableCell>
                {bosco ? (
                  <TableCell>
                    {row.is_owner ? (
                      <span className="text-sm text-text-secondary">—</span>
                    ) : (
                      <PlatformAdminForm
                        userId={row.id}
                        isAdmin={row.is_admin}
                        canApproveSpaces={row.can_approve_spaces}
                        canManageSubscriptions={row.can_manage_subscriptions}
                        canSupport={row.can_support}
                      />
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {bosco ? <p className="text-sm text-text-secondary">{t.manageHint}</p> : null}
    </div>
  );
}
