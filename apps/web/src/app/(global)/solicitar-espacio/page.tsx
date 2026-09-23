import Link from "next/link";
import { redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { ErrorState, PageHeader } from "@/components/ui";
import { isSpaceRequestFinal, type SpaceRequestState } from "@/core/space-requests";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { SentRequestView } from "./SentRequestView";
import { SpaceRequestForm } from "./SpaceRequestForm";

/**
 * G02 y G03 · pedir un espacio de mantenimiento y seguir la solicitud
 * (RN-ADM-05, RN-PLA; decisión 31: primero la cuenta, luego la solicitud,
 * luego la aprobación).
 *
 * Una sola ruta con dos caras, según el estado de la solicitud que se mira:
 *
 *   · **G02, el formulario**, cuando no hay ninguna, cuando es un borrador
 *     o cuando Cuotly ha pedido información (RN-PLA-03: son los dos estados
 *     desde los que el solicitante la mueve). Con "Necesita información"
 *     va arriba lo que Cuotly dijo que falta (RN-PLA-06).
 *   · **G03, la solicitud enviada**, en los demás: el estado, los tres
 *     datos de la cabecera y el camino en cuatro pasos
 *     (`spaceRequestSteps()`), que llega hasta la activación del espacio
 *     porque aprobar lo crea en prueba y emite la primera mensualidad, y
 *     pagarla lo activa (RN-PLA-05, RN-SUB-05).
 *
 * `?solicitud=<id>` abre una en concreto, que es a donde lleva cada fila de
 * Mis solicitudes; RLS solo devuelve las de quien mira. `?nueva=1` abre el
 * formulario vacío después de una decidida, y `?ver=datos` despliega lo
 * enviado. Las columnas van enumeradas: `decided_by` está revocada
 * (RN-PLA-07) y quién la revisó no se enseña.
 */
export const dynamic = "force-dynamic";

const t = es.spaceRequestForm;

type Params = Record<string, string | string[] | undefined>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v && v.trim() !== "" ? v.trim() : null;
}

export default async function RequestSpacePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("space_requests")
    .select(
      "id, business_name, contact_name, email, phone, estimated_establishments, estimated_users, intended_use, plan, tax_name, tax_id, tax_address, status, status_reason, submitted_at, decided_at, space_id, updated_at",
    )
    .eq("requester_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return <ErrorState title={t.errorTitle} description={error.message} />;
  }

  const solicitudes = data ?? [];
  // La que no esté cerrada es la que se sigue: solo puede haber una viva.
  const viva = solicitudes.find((r) => !isSpaceRequestFinal(r.status as SpaceRequestState)) ?? null;
  const pedida = uno(params.solicitud);
  const nueva = uno(params.nueva) === "1" && viva === null;
  const mirada = nueva ? null : (solicitudes.find((r) => r.id === pedida) ?? viva ?? solicitudes[0] ?? null);
  const state = mirada ? (mirada.status as SpaceRequestState) : null;

  const header = <PageHeader title={t.pageTitle} subtitle={t.pageSubtitle} />;

  // G02 · el formulario.
  if (mirada === null || state === "draft" || state === "needs_information") {
    return (
      <div className="space-y-6">
        {header}
        {state === "needs_information" && mirada?.status_reason ? (
          <InfoNote title={t.needsInfoTitle}>{mirada.status_reason}</InfoNote>
        ) : null}
        <SpaceRequestForm
          key={mirada?.id ?? "nueva"}
          initial={
            mirada
              ? {
                  businessName: mirada.business_name,
                  contactName: mirada.contact_name,
                  email: mirada.email,
                  phone: mirada.phone ?? "",
                  estimatedEstablishments: mirada.estimated_establishments,
                  estimatedUsers: mirada.estimated_users,
                  intendedUse: mirada.intended_use ?? "",
                  plan: mirada.plan,
                  taxName: mirada.tax_name ?? "",
                  taxId: mirada.tax_id ?? "",
                  taxAddress: mirada.tax_address ?? "",
                }
              : { email: user.email ?? "" }
          }
        />
      </div>
    );
  }

  // G03 · la solicitud enviada.
  const { data: space } = mirada.space_id
    ? await supabase
        .from("spaces")
        .select("slug, cuotly_status, cuotly_status_changed_at")
        .eq("id", mirada.space_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-4">
      {header}
      <SentRequestView
        request={mirada}
        space={space}
        showData={uno(params.ver) === "datos"}
        canRequestAnother={viva === null}
      />
      {solicitudes.length > 1 ? (
        <p className="text-sm">
          <Link href="/mis-solicitudes" className="text-cuotly-green underline">
            {es.globalContext.nav.requests}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
