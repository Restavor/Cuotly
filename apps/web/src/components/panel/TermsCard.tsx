import { AcceptTermsButton } from "@/app/espacios/[slug]/restaurantes/[id]/AcceptTermsButton";
import type { SubscriptionTerms } from "@/app/espacios/[slug]/planes/terms-load";
import { Card } from "@/components/ui";
import { termsNeedAcceptance } from "@/core/terms";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

/**
 * Maqueta 13 y R23 · las condiciones de lo que el restaurante tiene
 * contratado, con su estado, y el botón de aceptarlas para quien puede
 * (`client_can_accept_terms()`, contestado por el servidor). Vive aquí
 * porque la pintan el Inicio del panel y "Plan y servicios": una sola
 * tarjeta, no dos copias que un día digan cosas distintas.
 */
export function TermsCard({
  conditions,
  canAccept,
  timeZone,
}: {
  conditions: readonly { readonly subscriptionId: string; readonly terms: SubscriptionTerms | null }[];
  canAccept: boolean;
  timeZone: string;
}) {
  return (
        <Card title={es.clientArea.terms.title}>
          <p className="mb-3 text-sm text-text-secondary">{es.clientArea.terms.hint}</p>
          {conditions.length === 0 ? (
            <p className="text-sm text-text-secondary">{es.clientArea.terms.empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {conditions.map(({ subscriptionId, terms }) => (
                <li key={subscriptionId} className="flex flex-wrap items-start justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-primary-dark">{terms?.subjectName ?? "—"}</p>
                    {terms === null || terms.current === null ? (
                      <>
                        <p className="text-sm text-text-secondary">{es.clientArea.terms.noTerms}</p>
                        <p className="text-xs text-text-secondary">{es.clientArea.terms.noTermsReason}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-text-secondary">
                          {terms.accepted === null
                            ? es.clientArea.terms.pending(terms.current.version)
                            : terms.status === "accepted"
                              ? es.clientArea.terms.accepted(
                                  terms.accepted.version,
                                  enZona(terms.accepted.acceptedAt, timeZone, {
                                    dateStyle: "long",
                                  }),
                                )
                              : es.clientArea.terms.outdated(
                                  terms.accepted.version,
                                  terms.current.version,
                                )}
                        </p>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-sm text-cuotly-green underline">
                            {es.clientArea.terms.read(terms.current.version)}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-text">
                            {terms.current.conditions}
                          </p>
                        </details>
                        {termsNeedAcceptance(terms.status) && !canAccept ? (
                          <p className="mt-1 text-xs text-text-secondary">
                            {es.clientArea.terms.onlyOwner}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  {terms?.current && termsNeedAcceptance(terms.status) && canAccept ? (
                    <AcceptTermsButton
                      subscriptionId={subscriptionId}
                      versionId={terms.current.versionId}
                      version={terms.current.version}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
  );
}
