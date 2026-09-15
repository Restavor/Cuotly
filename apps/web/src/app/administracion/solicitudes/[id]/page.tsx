import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, ErrorState, StatusBadge } from "@/components/ui";
import { canApproveSpaces } from "@/core/platform-admin";
import { isSpaceRequestFinal, type SpaceRequestState } from "@/core/space-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myPlatformAccess } from "@/services/platform-gateway";

import { requestTone } from "../request-tone";
import { DecisionForms } from "./DecisionForms";

/**
 * Una solicitud de espacio y la decisión (RN-ADM-05): revisar, pedir
 * información, rechazar o aprobar (RN-PLA-03 a 06). Los botones se pintan
 * a quien tiene el permiso; `decide_space_request()` y
 * `approve_space_request()` lo vuelven a comprobar.
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null): string {
  return value === null ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("space_requests")
    .select(
      "id, business_name, contact_name, email, phone, estimated_establishments, estimated_users, intended_use, plan, tax_name, tax_id, tax_address, status, status_reason, submitted_at, decided_at, space_id, created_at",
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

  const t = es.platformAdmin.requests;
  const f = es.spaceRequestForm;
  const state = row.status as SpaceRequestState;
  const final = isSpaceRequestFinal(state);

  const { data: space } = row.space_id
    ? await supabase.from("spaces").select("slug, name").eq("id", row.space_id).maybeSingle()
    : { data: null };

  const campos: readonly [string, string | number | null][] = [
    [f.businessName, row.business_name],
    [f.contactName, row.contact_name],
    [f.email, row.email],
    [f.phone, row.phone],
    [f.estimatedEstablishments, row.estimated_establishments],
    [f.estimatedUsers, row.estimated_users],
    [f.intendedUse, row.intended_use],
    [f.plan, es.cuotlySubscription.plans[row.plan as "pro" | "agency"]],
    [f.taxName, row.tax_name],
    [f.taxId, row.tax_id],
    [f.taxAddress, row.tax_address],
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/administracion/solicitudes" className="text-cuotly-green underline">
            {t.back}
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">
          {t.detailTitle} · {row.business_name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <StatusBadge tone={requestTone(state)}>{f.states[state]}</StatusBadge>
          <span>
            {f.submittedAt} {cuando(row.submitted_at)}
          </span>
          {row.decided_at ? (
            <span>
              {f.decidedAt} {cuando(row.decided_at)}
            </span>
          ) : null}
        </div>
        {row.status_reason ? (
          <p className="mt-2 text-sm">
            <span className="font-semibold">{f.reasonLabel}:</span> {row.status_reason}
          </p>
        ) : null}
        {space ? (
          <p className="mt-2 text-sm">
            {t.createdSpace}:{" "}
            <Link href={`/espacios/${space.slug}`} className="text-cuotly-green underline">
              {space.name}
            </Link>
          </p>
        ) : null}
      </header>

      <Card title={t.fields}>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {campos.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</dt>
              <dd className="text-sm text-text">{value === null || value === "" ? "—" : String(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={t.decisionTitle}>
        <p className="mb-4 text-sm text-text-secondary">{t.decisionHint}</p>
        {final ? (
          <p className="text-sm text-text-secondary">{t.finalHint}</p>
        ) : !puedeDecidir ? (
          <p className="text-sm text-text-secondary">{t.noPermissionHint}</p>
        ) : (
          <DecisionForms requestId={row.id} state={state} />
        )}
        <p className="mt-4 text-xs text-text-secondary">{t.requesterHidden}</p>
      </Card>
    </div>
  );
}
