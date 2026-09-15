import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, ErrorState, StatusBadge } from "@/components/ui";
import { isSpaceRequestFinal, type SpaceRequestState } from "@/core/space-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { requestTone } from "../administracion/solicitudes/request-tone";
import { SpaceRequestForm } from "./SpaceRequestForm";

/**
 * RN-ADM-05 · el formulario básico con el que alguien recién registrado
 * pide su espacio y ve en qué estado está (decisión 31: primero la cuenta,
 * luego la solicitud, luego la aprobación). Lo que se ve sale de
 * `space_requests` con la política de la 89: cada uno la suya, y sin
 * `decided_by` (RN-PLA-07), así que las columnas van enumeradas.
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null): string {
  return value === null ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

export default async function RequestSpacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // La más reciente que no esté cerrada es la que se sigue; si todas están
  // decididas, se enseña la última y se deja pedir otra.
  const { data, error } = await supabase
    .from("space_requests")
    .select(
      "id, business_name, contact_name, email, phone, estimated_establishments, estimated_users, intended_use, plan, tax_name, tax_id, tax_address, status, status_reason, submitted_at, decided_at, space_id, updated_at",
    )
    .eq("requester_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <ErrorState title={es.spaceRequestForm.errorTitle} description={error.message} />
      </main>
    );
  }

  const t = es.spaceRequestForm;
  const solicitudes = data ?? [];
  const viva = solicitudes.find((r) => !isSpaceRequestFinal(r.status as SpaceRequestState)) ?? null;
  const ultima = viva ?? solicitudes[0] ?? null;
  const state = ultima ? (ultima.status as SpaceRequestState) : null;
  const editable = ultima === null || state === "draft" || state === "needs_information" || isSpaceRequestFinal(state!);

  const { data: space } = ultima?.space_id
    ? await supabase.from("spaces").select("slug").eq("id", ultima.space_id).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <p className="text-sm">
        <Link href="/" className="text-cuotly-green underline">
          {t.back}
        </Link>
      </p>
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      {ultima && state ? (
        <Card title={t.statusTitle}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge tone={requestTone(state)}>{t.states[state]}</StatusBadge>
            {ultima.submitted_at ? (
              <span className="text-text-secondary">
                {t.submittedAt} {cuando(ultima.submitted_at)}
              </span>
            ) : null}
            {ultima.decided_at ? (
              <span className="text-text-secondary">
                {t.decidedAt} {cuando(ultima.decided_at)}
              </span>
            ) : null}
          </div>
          {ultima.status_reason ? (
            <p className="mt-3 text-sm">
              <span className="font-semibold">{t.reasonLabel}:</span> {ultima.status_reason}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-text-secondary">
            {state === "approved"
              ? t.approvedHint
              : state === "rejected"
                ? t.rejectedHint
                : state === "needs_information"
                  ? t.needsInfoHint
                  : state === "draft"
                    ? null
                    : t.pendingHint}
          </p>
          {state === "approved" && space ? (
            <p className="mt-3 text-sm">
              <Link href={`/espacios/${space.slug}`} className="text-cuotly-green underline">
                {t.goToSpace}
              </Link>
            </p>
          ) : null}
        </Card>
      ) : null}

      {editable ? (
        <Card title={t.formTitle}>
          <p className="mb-4 text-sm text-text-secondary">{t.formHint}</p>
          <SpaceRequestForm
            initial={
              ultima && !isSpaceRequestFinal(state!)
                ? {
                    businessName: ultima.business_name,
                    contactName: ultima.contact_name,
                    email: ultima.email,
                    phone: ultima.phone ?? "",
                    estimatedEstablishments: ultima.estimated_establishments,
                    estimatedUsers: ultima.estimated_users,
                    intendedUse: ultima.intended_use ?? "",
                    plan: ultima.plan,
                    taxName: ultima.tax_name ?? "",
                    taxId: ultima.tax_id ?? "",
                    taxAddress: ultima.tax_address ?? "",
                  }
                : { email: user.email ?? "" }
            }
          />
        </Card>
      ) : null}
    </main>
  );
}
