"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../action-state";
import { removePlatformAdmin, savePlatformAdmin } from "../actions";

/**
 * RN-ADM-03 · los cuatro permisos de §167 de una persona —el cuarto,
 * eliminar cuentas y espacios, desde la decisión 81 (RN-ADM-14)— y
 * retirar el rol.
 * Solo Bosco lo ve, y solo Bosco puede: lo comprueba el servidor.
 */
export function PlatformAdminForm({
  userId,
  isAdmin,
  canApproveSpaces,
  canManageSubscriptions,
  canSupport,
  canDeleteAccounts,
}: {
  userId: string;
  isAdmin: boolean;
  canApproveSpaces: boolean;
  canManageSubscriptions: boolean;
  canSupport: boolean;
  canDeleteAccounts: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState(savePlatformAdmin, INITIAL_ADMIN_STATE);
  const [revokeState, revokeAction, revoking] = useActionState(removePlatformAdmin, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.users;

  return (
    <div className="space-y-2">
      <form action={saveAction} className="flex flex-wrap items-center gap-3 text-sm">
        <input type="hidden" name="userId" value={userId} />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canApproveSpaces" defaultChecked={canApproveSpaces} />
          {t.canApproveSpaces}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canManageSubscriptions" defaultChecked={canManageSubscriptions} />
          {t.canManageSubscriptions}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canSupport" defaultChecked={canSupport} />
          {t.canSupport}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canDeleteAccounts" defaultChecked={canDeleteAccounts} />
          {t.canDeleteAccounts}
        </label>
        <Button type="submit" variant="secondary" pending={saving} className="px-3 py-1.5 text-xs">
          {saving ? t.pending : t.save}
        </Button>
        {saveState.error ? (
          <p role="alert" className="text-xs text-danger">
            {saveState.error}
          </p>
        ) : null}
        {saveState.done ? (
          <p role="status" className="text-xs text-text-secondary">
            {t.saved}
          </p>
        ) : null}
      </form>
      {isAdmin ? (
        <form action={revokeAction} className="flex items-center gap-3 text-sm">
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="danger" pending={revoking} className="px-3 py-1.5 text-xs">
            {revoking ? t.pending : t.revoke}
          </Button>
          {revokeState.error ? (
            <p role="alert" className="text-xs text-danger">
              {revokeState.error}
            </p>
          ) : null}
          {revokeState.done ? (
            <p role="status" className="text-xs text-text-secondary">
              {t.revoked}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
