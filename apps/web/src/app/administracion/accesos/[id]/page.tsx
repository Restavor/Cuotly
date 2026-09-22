import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, ErrorState, StatusBadge } from "@/components/ui";
import { isAccessRequestFinal, type AccessRequestState } from "@/core/access-requests";
import { countryName } from "@/core/countries";
import { canApproveSpaces } from "@/core/platform-admin";
import { TAX_ID_VERIFICATIONS, taxIdVerified, type TaxIdVerification } from "@/core/tax-id";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myPlatformAccess } from "@/services/platform-gateway";

import { accessTone } from "../access-tone";
import { AccessDecisionForms } from "./AccessDecisionForms";

/**
 * PRD §37 · una solicitud de acceso y su decisión. Los botones se pintan a
 * quien tiene "Aprobar espacios"; `decide_access_request()` y
 * `approve_access_request()` lo vuelven a comprobar, con la sesión en dos
 * pasos dentro (RN-ACC-06).
 *
 * Lo que esta pantalla **no** enseña: el enlace de alta. Es una credencial
 * y su sitio es el buzón de quien la pidió (RN-ACC-04).
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null): string {
  return value === null
    ? "—"
    : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminAccessRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("access_requests")
    .select(
      "id, business_name, contact_name, email, phone, tax_id, tax_id_country, tax_id_verification, tax_id_registry_name, comments, applicant_reply, status, status_reason, decided_at, account_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />;
  }
  if (!row) notFound();

  let puedeDecidir = false;
  try {
    puedeDecidir = canApproveSpaces(await myPlatformAccess(supabase));
  } catch {
    puedeDecidir = false;
  }

  const t = es.platformAdmin.access;
  const state = row.status as AccessRequestState;
  const final = isAccessRequestFinal(state);

  const campos: readonly [string, string | null][] = [
    [t.business, row.business_name],
    [t.contact, row.contact_name],
    [t.email, row.email],
    [t.phone, row.phone],
    [t.taxId, row.tax_id ?? t.taxIdMissing],
    [t.taxCountry, row.tax_id_country === null ? null : countryName(row.tax_id_country)],
    [t.comments, row.comments],
    [t.createdAt, cuando(row.created_at)],
  ];

  // Decisión 68 · cómo quedó comprobado el documento. Lo que no se pudo
  // confirmar se dice en ámbar, para mirarlo antes de aprobar.
  const comprobacion = (TAX_ID_VERIFICATIONS as readonly string[]).includes(row.tax_id_verification ?? "")
    ? (row.tax_id_verification as TaxIdVerification)
    : null;

  return (
    <div className="space-y-6">
      <Link href="/administracion/accesos" className="text-sm text-cuotly-green underline">
        {t.back}
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary-dark">{t.detailTitle}</h1>
        <StatusBadge tone={accessTone(state)}>{t.states[state]}</StatusBadge>
      </header>

      <Card title={t.fields}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {campos.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-sm text-text-secondary">{etiqueta}</dt>
              <dd className="text-sm text-text">{valor ?? "—"}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-text-secondary">{t.taxCheckTitle}</p>
          {comprobacion === null ? (
            <p className="text-sm text-text">{t.taxCheckMissing}</p>
          ) : (
            <p className="mt-1 flex items-start gap-2 text-sm text-text">
              <StatusBadge tone={taxIdVerified(comprobacion) ? "success" : "warning"}>
                {taxIdVerified(comprobacion) ? t.taxCheckOk : t.taxCheckReview}
              </StatusBadge>
              <span>{t.taxChecks[comprobacion]}</span>
            </p>
          )}
          {row.tax_id_registry_name ? (
            <p className="mt-2 text-sm text-text">
              <span className="text-text-secondary">{t.registryName}: </span>
              {row.tax_id_registry_name}
              <span className="block text-xs text-text-secondary">{t.registryNameHint}</span>
            </p>
          ) : null}
        </div>

        {row.applicant_reply ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-text-secondary">{t.applicantReply}</p>
            <p className="text-sm text-text">{row.applicant_reply}</p>
          </div>
        ) : null}

        {row.status_reason ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-text-secondary">{t.reasonLabel}</p>
            <p className="text-sm text-text">{row.status_reason}</p>
          </div>
        ) : null}

        {state === "approved" ? (
          <p className="mt-4 border-t border-border pt-4 text-sm text-text-secondary">
            {row.account_id ? t.accountCreated : t.accountPending}
          </p>
        ) : null}
      </Card>

      <Card title={t.decisionTitle}>
        <p className="mb-4 text-sm text-text-secondary">{t.decisionHint}</p>
        <p className="mb-4 text-sm text-text-secondary">{t.requesterHidden}</p>

        {final ? (
          <p className="text-sm text-text-secondary">{t.finalHint}</p>
        ) : puedeDecidir ? (
          <AccessDecisionForms requestId={row.id} state={state} />
        ) : (
          <p className="text-sm text-text-secondary">{t.noPermissionHint}</p>
        )}
      </Card>
    </div>
  );
}
