import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { Card, StatusBadge } from "@/components/ui";
import { menuCorrectionAvailability } from "@/core/daily-menu";
import { isMenuEditable, isMenuState, menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { enZona, fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../../timezone-load";
import { ActionPanel, CorrectionForm, DetailsForm, VersionEditor } from "./MenuForms";

/**
 * Un menú, visto por el restaurante (Fase 2, Hito 10; RN-MEN-01 a 07,
 * 09, 10, 12).
 *
 * Lo que se enseña lo filtra RLS (el menú, sus versiones, su historial y
 * sus descargas sin ningún actor: P7). Los plazos y la garantía los
 * calcula `menu_deadlines()` en el servidor (RN-MEN-07); aquí solo se
 * escriben. Los botones se eligen por estado, y quien decide de verdad es
 * la función de cada acción.
 */
export const dynamic = "force-dynamic";

const t = es.dailyMenuClient;

type MenuKindKey = keyof typeof es.naming.menuKinds;

/**
 * La hora, en la zona del espacio (CLAUDE.md). La zona llega de
 * `establishment_timezone()` porque el restaurante no puede leer
 * `spaces`: escrita a mano sería la de Restavor para todo el mundo.
 */
function horaEnZona(iso: string, timeZone: string): string {
  return enZona(iso, timeZone, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ClientMenuPage({
  params,
}: {
  params: Promise<{ slug: string; id: string; menuId: string }>;
}) {
  const { slug, id, menuId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: menu } = await supabase
    .from("menus")
    .select("id, establishment_id, name, kind, target_date, template_id, state, current_version_id, published_at")
    .eq("id", menuId)
    .eq("establishment_id", id)
    .maybeSingle();
  if (!menu || !isMenuState(menu.state)) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}/menu-diario`;

  const [
    { data: versions },
    { data: templates },
    { data: events },
    { data: downloads },
    { data: deadlineRows },
    { data: corrections },
    timezone,
  ] = await Promise.all([
      supabase
        .from("menu_versions")
        .select("id, version, starters, mains, desserts, drink, price_cents, note, after_cutoff, created_at")
        .eq("menu_id", menuId)
        .order("version", { ascending: false }),
      supabase
        .from("menu_templates")
        .select("id, name")
        .eq("establishment_id", id)
        .is("archived_at", null)
        .order("created_at"),
      supabase
        .from("menu_events")
        .select("id, from_state, to_state, reason, occurred_at")
        .eq("menu_id", menuId)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("menu_downloads")
        .select("id, format, by_team, downloaded_at")
        .eq("menu_id", menuId)
        .order("downloaded_at", { ascending: false }),
      supabase.rpc("menu_deadlines", { p_menu_id: menuId }),
      // Sin quién la pidió ni quién la cerró (P7, privilegio de columna).
      supabase
        .from("menu_corrections")
        .select("id, kind, description, requested_at, requested_before_cutoff, completed_at, completion_note")
        .eq("menu_id", menuId)
        .order("requested_at", { ascending: false }),
      // La zona horaria del espacio: el restaurante no puede leer `spaces`
      // y las horas de esta pantalla son plazos contractuales (RN-MEN-07).
      loadEstablishmentTimezone(supabase, id),
    ]);

  const current = versions?.find((v) => v.id === menu.current_version_id) ?? null;
  const deadlines = deadlineRows?.[0] ?? null;
  // RN-COR-10 · el corte de las 21:00 lo deriva el servidor (RN-DAT-05);
  // aquí solo se compara con la hora de ahora para decir si la corrección
  // iría garantizada. Sin plazos no hay menú publicado que corregir.
  const correctionAvailability = deadlines
    ? menuCorrectionAvailability({
        state: menu.state,
        publishedAt: menu.published_at ? new Date(menu.published_at) : null,
        alreadyRequested: (corrections ?? []).some((c) => c.kind === "client_request"),
        cutoffAt: new Date(deadlines.cutoff_at),
        now: new Date(),
      })
    : ({ available: false, reason: "not_published" } as const);
  const editable = isMenuEditable(menu.state);
  const templateName = templates?.find((tpl) => tpl.id === menu.template_id)?.name ?? null;
  const canDownload = current !== null && menu.template_id !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <Link href={base} className="text-sm text-primary underline-offset-2 hover:underline">
          {t.backToList}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-dark">{menu.name}</h1>
        <p className="text-sm text-text-secondary">
          {t.detailKind}: {es.naming.menuKinds[menu.kind as MenuKindKey] ?? menu.kind} · {t.detailDate}:{" "}
          {fechaCorta(menu.target_date)} · {t.detailTemplate}: {templateName ?? t.detailNoTemplate}
        </p>
        {/*
          El testid existe para los recorridos: "Preparado" aparece dos
          veces en esta pantalla —aquí, como estado, y en el libro de
          estados de abajo— y un `getByText` suelto encontraba las dos.
          El estado de la cabecera es el que dice en qué punto está el
          menú; el de la lista es su historia.
        */}
        <div className="mt-2" data-testid="estado-del-menu">
          <StatusBadge tone={menuTone(menu.state)}>{es.naming.states.menu[menu.state]}</StatusBadge>
        </div>
      </header>

      {deadlines ? (
        <Card title={t.deadlinesTitle}>
          <p className="text-sm text-text">{t.cutoffLine(horaEnZona(deadlines.cutoff_at, timezone))}</p>
          <p className="text-sm text-text">{t.publishByLine(horaEnZona(deadlines.publish_by_at, timezone))}</p>
          <p className="mt-2 text-sm text-text-secondary">
            {deadlines.guaranteed === null ? t.notRequested : deadlines.guaranteed ? t.guaranteed : t.notGuaranteed}
          </p>
        </Card>
      ) : null}

      <ActionPanel
        slug={slug}
        establishmentId={id}
        menuId={menuId}
        state={menu.state}
        idempotencyKey={randomUUID()}
        defaultCopyDate={menu.target_date}
      />

      <CorrectionForm menuId={menuId} availability={correctionAvailability} />

      {corrections && corrections.length > 0 ? (
        <Card title={t.correctionsListTitle}>
          <ul className="space-y-2">
            {corrections.map((c) => (
              <li key={c.id} className="text-sm">
                <p className="text-text">{c.description}</p>
                <p className="text-text-secondary">
                  {t.correctionLine(horaEnZona(c.requested_at, timezone))}
                  {c.kind === "team_error" ? ` · ${t.correctionByTeam}` : ""}
                  {" · "}
                  {c.requested_before_cutoff ? t.correctionGuaranteed : t.correctionNotGuaranteed}
                  {" · "}
                  {c.completed_at ? t.correctionCompleted(horaEnZona(c.completed_at, timezone)) : t.correctionPending}
                  {c.completed_at && c.completion_note ? ` · ${c.completion_note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <VersionEditor
        menuId={menuId}
        editable={editable}
        current={
          current
            ? {
                version: current.version,
                starters: current.starters,
                mains: current.mains,
                desserts: current.desserts,
                drink: current.drink,
                priceCents: current.price_cents,
                note: current.note,
              }
            : null
        }
      />

      <DetailsForm
        menuId={menuId}
        name={menu.name}
        kind={menu.kind}
        targetDate={menu.target_date}
        templateId={menu.template_id}
        templates={(templates ?? []).map((tpl) => ({ id: tpl.id, name: tpl.name }))}
        editable={editable}
      />

      <Card title={t.downloadsTitle}>
        {canDownload ? (
          <div className="flex flex-wrap gap-3">
            <a href={`${base}/${menuId}/descargar?formato=png`} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark">
              {t.downloadPng}
            </a>
            <a href={`${base}/${menuId}/descargar?formato=pdf`} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-soft-surface">
              {t.downloadPdf}
            </a>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{t.downloadsNeedContent}</p>
        )}
        <p className="mt-3 text-sm text-text-secondary">{t.downloadsHint}</p>
        {downloads && downloads.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-text-secondary">
            <li className="font-medium text-text">{t.downloadsHistory(downloads.length)}</li>
            {downloads.slice(0, 10).map((d) => (
              <li key={d.id}>{t.downloadLine(d.format, horaEnZona(d.downloaded_at, timezone), d.by_team)}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title={t.versionsTitle}>
        <ul className="space-y-1 text-sm text-text-secondary">
          {(versions ?? []).map((v) => (
            <li key={v.id}>
              {t.versionLine(v.version, horaEnZona(v.created_at, timezone))}
              {v.after_cutoff ? ` · ${t.versionAfterCutoff}` : ""}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t.historyTitle}>
        {!events || events.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.historyEmpty}</p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="text-text-secondary">{horaEnZona(event.occurred_at, timezone)} · </span>
                <span className="font-medium text-text">
                  {isMenuState(event.to_state) ? es.naming.states.menu[event.to_state] : event.to_state}
                </span>
                {event.reason ? <p className="text-text-secondary">{event.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
