import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { Card, PageHeader, Tabs } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { TerminationForm } from "../../TerminationForm";
import { loadEstablishmentTimezone } from "../../timezone-load";
import { loadClientPlan } from "../plan-load";
import { PlanChangeForm } from "./PlanChangeForm";

/**
 * R24 · solicitar un cambio de plan o comunicar la baja.
 *
 * La baja es la operación de siempre (`request_service_termination()`,
 * RN-EST-09) con su formulario. El cambio de plan no tiene operación para
 * el restaurante —lo programa el equipo— y por eso esta pestaña no dibuja
 * un "plan propuesto" con precio y contenido: el restaurante no puede leer
 * los planes de su espacio, y enseñar unos inventados sería peor que no
 * enseñar ninguno. Lo que sí hace es dejar escrito lo que quiere en su
 * conversación con el equipo, y enseñar el cambio programado cuando lo hay.
 */
export const dynamic = "force-dynamic";

const t = es.panelPlan;
type CategoryKey = keyof typeof es.naming.categories;

export default async function ClientPlanChangePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, zona, { data: canWrite }] = await Promise.all([
    supabase.from("establishments").select("id, status").eq("id", id).maybeSingle(),
    loadEstablishmentTimezone(supabase, id),
    supabase.rpc("can_write_establishment", { p_establishment_id: id }),
  ]);
  if (!establishment) notFound();

  const datos = await loadClientPlan(supabase, id);
  const base = `/espacios/${slug}/restaurantes/${id}`;
  const activa = tab === "baja" ? "baja" : "cambio";
  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <PageHeader title={t.changeTitle} subtitle={t.changeSubtitle} />
      <Tabs
        label={t.tabsLabel}
        active={activa}
        tabs={[
          { key: "cambio", label: t.tabs.change, href: `${base}/plan/cambio` },
          { key: "baja", label: t.tabs.termination, href: `${base}/plan/cambio?tab=baja` },
        ]}
      />

      {activa === "baja" ? (
        <TerminationForm establishmentId={id} status={establishment.status} canWrite={canWrite === true} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title={t.currentTitle}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/25 text-primary-dark">
                  <Icon name="crown" className="h-6 w-6" />
                </span>
                <p className="text-xl font-bold text-primary-dark">{datos.plan?.terms?.subjectName ?? t.noName}</p>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-text">
                {datos.allowance
                  .filter((b) => b.included > 0)
                  .map((b) => (
                    <li key={b.category} className="flex gap-2">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                      {t.includedLine(b.included, es.naming.categories[b.category as CategoryKey] ?? b.category)}
                    </li>
                  ))}
              </ul>
              {datos.scheduledChange ? (
                <div className="mt-4">
                  <InfoNote title={t.scheduledTitle}>
                    {t.scheduledLine(fecha(datos.scheduledChange.effective_at))}
                  </InfoNote>
                </div>
              ) : null}
            </Card>
            <Card title={t.tabs.change} className="lg:col-span-2">
              <p className="mb-4 text-sm text-text-secondary">{t.changeHow}</p>
              <PlanChangeForm
                establishmentId={id}
                cancelHref={`${base}/plan`}
                messagesHref={`${base}/mensajes`}
              />
            </Card>
          </div>

          <Card title={t.stepsTitle}>
            <ol className="grid gap-4 md:grid-cols-3">
              {t.steps.map((paso, i) => (
                <li key={paso.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-surface font-bold text-primary-dark">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-semibold text-text">{paso.title}</span>
                    <span className="block text-sm text-text-secondary">{paso.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
