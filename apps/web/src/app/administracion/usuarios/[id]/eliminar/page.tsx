import Link from "next/link";

import { Card, EmptyState, ErrorState, NoPermissionState } from "@/components/ui";
import { canDeleteAccounts, type AccountDeletionPreview } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { accountDeletionPreview, myPlatformAccess } from "@/services/platform-gateway";

import { AccountDeletionForm } from "../../../DeletionForms";

/**
 * Decisión 81 · eliminar una cuenta (RN-ADM-18, RN-ADM-19, RN-ADM-20).
 *
 * Es una página y no una ventana porque antes de confirmar hay que ver qué
 * se lleva por delante —en cuántos equipos está, cuántos accesos de
 * cliente tiene— y decidir, espacio a espacio, quién se queda con los que
 * eran solo suyos. Lo que se enseña sale de
 * `platform_account_deletion_preview()`, que comprueba el permiso; y
 * `platform_delete_account()` lo vuelve a comprobar todo al confirmar.
 */
export const dynamic = "force-dynamic";

export default async function AdminDeleteAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const t = es.platformAdmin.deletion;
  const ta = t.account;

  let preview: AccountDeletionPreview | null = null;
  let puede = false;
  let fallo: string | null = null;
  try {
    puede = canDeleteAccounts(await myPlatformAccess(supabase));
    if (puede) preview = await accountDeletionPreview(supabase, id);
  } catch (error) {
    fallo = error instanceof Error ? error.message : String(error);
  }

  if (fallo !== null) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={fallo} />;
  }
  if (!puede || preview === null) {
    return (
      <div className="space-y-4">
        <NoPermissionState />
        <p className="text-sm text-text-secondary">{t.noPermissionHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/administracion/usuarios" className="text-sm text-cuotly-green underline">
          {ta.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-dark">{ta.title(preview.email)}</h1>
      </header>

      {preview.protected ? (
        <EmptyState title={ta.protectedTitle} description={ta.protectedReason} />
      ) : preview.closed ? (
        <EmptyState title={ta.closedTitle} description={ta.closedReason} />
      ) : (
        <Card>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-text">
            {ta.consequences.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
          <p className="mb-2 text-sm text-text-secondary">
            {ta.summary(preview.teamMemberships, preview.clientAccesses)}
          </p>
          {preview.platformAdmin ? (
            <p className="mb-2 text-sm font-semibold text-danger">{ta.alsoRevokesAdmin}</p>
          ) : null}
          <p className="mb-4 text-sm text-text-secondary">{t.nothingIsErased}</p>
          <AccountDeletionForm userId={id} email={preview.email} spaces={preview.soleOwnerSpaces} />
        </Card>
      )}
    </div>
  );
}
