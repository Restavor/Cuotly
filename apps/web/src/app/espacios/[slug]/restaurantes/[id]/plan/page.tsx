import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { TermsCard } from "@/components/panel/TermsCard";
import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { INCLUDED_TEMPLATE_LIMIT } from "@/core/daily-menu";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";
import { RevisionChanges } from "@/app/espacios/[slug]/planes/RevisionBlock";

import { AcceptRevisionButton } from "../AcceptRevisionButton";
import { loadClientPlan } from "./plan-load";

/**
 * R23 · Plan y servicios del restaurante.
 *
 * Lo que el dibujo pinta y aquí no está: el precio ("599 € + IVA / mes")
 * y la frase de presentación del plan. El restaurante no lee `plans` y el
 * precio lo ve en sus cobros, donde es el que se le cobra de verdad. Y el
 * "Periodo mensual" con su inicio: la bolsa del ciclo dice cuándo se
 * renueva, no cuándo empezó, y no se calcula una fecha que nadie guarda.
 */
export const dynamic = "force-dynamic";

const t = es.panelPlan;
type CategoryKey = keyof typeof es.naming.categories;

export default async function ClientPlanPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, zona, { data: canAccept }] = await Promise.all([
    supabase.from("establishments").select("id").eq("id", id).maybeSingle(),
    loadEstablishmentTimezone(supabase, id),
    supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
  ]);
  if (!establishment) notFound();

  const [datos, { data: ledger }] = await Promise.all([
    loadClientPlan(supabase, id),
    // HU-25 · el libro de consumos del restaurante: apuntes con signo, no un
    // contador (RN-DAT-04). Al restaurante nunca se le devuelve la persona
    // del equipo: `establishment_consumption_ledger()` solo rellena el autor
    // para quien es del espacio (CLAUDE.md MUST NOT).
    supabase.rpc("establishment_consumption_ledger", { p_establishment_id: id }),
  ]);
  const apuntes = ledger ?? [];
  const base = `/espacios/${slug}/restaurantes/${id}`;
  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "long", year: "numeric" });
  const categoria = (c: string) => es.naming.categories[c as CategoryKey] ?? c;
  const renovacion = datos.allowance[0]?.renews_at ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {datos.plan === null ? (
        <Card>
          <EmptyState title={t.noPlanTitle} description={t.noPlanReason} />
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-primary-dark">{t.currentTitle}</h2>
            <StatusBadge tone="success">{t.active}</StatusBadge>
          </div>
          <div className="grid gap-6 md:grid-cols-3 md:divide-x md:divide-border">
            <div>
              <p className="text-3xl font-bold text-primary-dark">{datos.plan.terms?.subjectName ?? t.noName}</p>
              <p className="mt-2 text-sm text-text-secondary">{t.noPrice}</p>
            </div>
            <div className="md:pl-6">
              <p className="mb-2 font-semibold text-text">{t.includesTitle}</p>
              <ul className="space-y-2 text-sm text-text">
                {datos.allowance.map((b) => (
                  <li key={b.category} className="flex gap-2">
                    <Icon name={b.included > 0 ? "check" : "close"} className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                    {b.included > 0 ? t.includedLine(b.included, categoria(b.category)) : `${categoria(b.category)} · ${t.notIncluded}`}
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:pl-6">
              <p className="mb-2 font-semibold text-text">
                {t.usageTitle} <span className="font-normal text-text-secondary">{t.usageSubtitle}</span>
              </p>
              <ul className="space-y-3 text-sm">
                {datos.allowance
                  .filter((b) => b.included > 0)
                  .map((b) => {
                    // La bolsa la da el servidor; aquí solo se resta para
                    // decir cuánto se ha usado.
                    const usados = Math.max(0, b.included - b.remaining);
                    return (
                      <li key={b.category} className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <span className="text-text">{categoria(b.category)}</span>
                        <span className="text-text">{t.usageLine(usados, b.included)}</span>
                        <span className="col-span-2">
                          <ProgressBar percent={Math.round((usados / b.included) * 100)} label={categoria(b.category)} />
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-[10px] bg-soft-surface p-4 sm:grid-cols-2">
            {renovacion ? (
              <div className="flex gap-3">
                <Icon name="calendar" className="mt-0.5 h-5 w-5 text-text-secondary" />
                <div>
                  <p className="text-sm font-semibold text-text">{t.renewalTitle}</p>
                  <p className="text-sm text-text-secondary">{fecha(renovacion)}</p>
                </div>
              </div>
            ) : null}
            {datos.commitmentEndsAt ? (
              <div className="flex gap-3">
                <Icon name="document" className="mt-0.5 h-5 w-5 text-text-secondary" />
                <div>
                  <p className="text-sm font-semibold text-text">{t.commitmentTitle}</p>
                  <p className="text-sm text-text-secondary">{t.commitmentUntil(fecha(datos.commitmentEndsAt))}</p>
                </div>
              </div>
            ) : null}
          </div>

          {datos.scheduledChange ? (
            <div className="mt-4">
              <InfoNote title={t.scheduledTitle}>
                {t.scheduledDirection[datos.scheduledChange.direction as "upgrade" | "downgrade"] ?? t.scheduledDirection.same}
                {" · "}
                {t.scheduledLine(fecha(datos.scheduledChange.effective_at))}
              </InfoNote>
            </div>
          ) : null}
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary-dark">{t.serviceTitle}</h2>
          {datos.menuBalance ? <StatusBadge tone="success">{t.serviceActive}</StatusBadge> : null}
        </div>
        {datos.menuBalance ? (
          <div className="grid gap-6 md:grid-cols-3">
            <p className="text-2xl font-bold text-primary-dark">{t.serviceMenu}</p>
            <ul className="space-y-2 text-sm text-text">
              {[t.serviceMenuUpdates(datos.menuBalance.included_updates), t.serviceMenuTemplates(INCLUDED_TEMPLATE_LIMIT)].map(
                (linea) => (
                  <li key={linea} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                    {linea}
                  </li>
                ),
              )}
            </ul>
            <InfoNote title={t.serviceMenu}>{t.serviceSeparate}</InfoNote>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{t.noService}</p>
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <ButtonLink href="#consumos" variant="outline" icon="reports">
          {t.viewUsage}
        </ButtonLink>
        <ButtonLink href="#condiciones" variant="outline" icon="document">
          {t.viewConditions}
        </ButtonLink>
        <ButtonLink href={`${base}/plan/cambio`} icon="plus">
          {t.requestChange}
        </ButtonLink>
      </div>

      <section id="consumos" className="scroll-mt-20">
        <Card title={es.clientArea.ledgerTitle}>
          {apuntes.length === 0 ? (
            <EmptyState title={es.clientArea.ledgerEmptyTitle} description={es.clientArea.ledgerEmptyReason} />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.clientArea.ledgerDateColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.clientArea.ledgerCategoryColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.clientArea.ledgerAmountColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.clientArea.ledgerRequestColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.clientArea.ledgerReasonColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {apuntes.map((entry) => (
                  <TableRow key={entry.entry_id}>
                    <TableCell>{enZona(entry.occurred_at, zona, { dateStyle: "short" })}</TableCell>
                    <TableCell>{categoria(entry.category)}</TableCell>
                    <TableCell>{entry.amount > 0 ? `+${entry.amount}` : String(entry.amount)}</TableCell>
                    <TableCell>{entry.request_code ?? "—"}</TableCell>
                    <TableCell>{entry.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      <section id="condiciones" className="scroll-mt-20">
        {datos.revisions.length > 0 ? (
          <Card title={t.revision.title}>
            <ul className="divide-y divide-border" data-testid="version-nueva">
              {datos.revisions.map(({ subscriptionId, name, revision }) => {
                const falta = revision.harms && !revision.accepted;
                return (
                  <li key={subscriptionId} className="space-y-3 py-3">
                    <p className="font-semibold text-primary-dark">
                      {t.revision.intro(name ?? t.noName, revision.headRevision)}
                    </p>
                    <p className="text-sm text-text">
                      {revision.state === "held_back"
                        ? t.revision.heldBack
                        : !revision.harms
                          ? t.revision.favours
                          : revision.accepted
                            ? t.revision.accepted
                            : t.revision.needsAcceptance}
                    </p>
                    {revision.state !== "held_back" && revision.movesAt && !falta ? (
                      <p className="text-sm text-text-secondary">{t.revision.moves(fecha(revision.movesAt))}</p>
                    ) : null}
                    <div>
                      <p className="mb-1 text-sm font-semibold text-text">{t.revision.changesTitle}</p>
                      <RevisionChanges changes={revision.changes} />
                    </div>
                    {falta ? (
                      canAccept === true ? (
                        <AcceptRevisionButton subscriptionId={subscriptionId} revision={revision.headRevision} />
                      ) : (
                        <p className="text-xs text-text-secondary">{t.revision.onlyOwner}</p>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}
        <TermsCard conditions={datos.conditions} canAccept={canAccept === true} timeZone={zona} />
      </section>
    </div>
  );
}
