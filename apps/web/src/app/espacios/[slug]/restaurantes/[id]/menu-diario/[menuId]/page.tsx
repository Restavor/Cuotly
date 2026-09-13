import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { Card, StatusBadge } from "@/components/ui";
import { isMenuEditable, isMenuState, menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { ActionPanel, DetailsForm, VersionEditor } from "./MenuForms";

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

function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
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

  const [{ data: versions }, { data: templates }, { data: events }, { data: downloads }, { data: deadlineRows }] =
    await Promise.all([
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
    ]);

  const current = versions?.find((v) => v.id === menu.current_version_id) ?? null;
  const deadlines = deadlineRows?.[0] ?? null;
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
        <div className="mt-2">
          <StatusBadge tone={menuTone(menu.state)}>{es.naming.states.menu[menu.state]}</StatusBadge>
        </div>
      </header>

      {deadlines ? (
        <Card title={t.deadlinesTitle}>
          <p className="text-sm text-text">{t.cutoffLine(horaLocal(deadlines.cutoff_at))}</p>
          <p className="text-sm text-text">{t.publishByLine(horaLocal(deadlines.publish_by_at))}</p>
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
              <li key={d.id}>{t.downloadLine(d.format, horaLocal(d.downloaded_at), d.by_team)}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title={t.versionsTitle}>
        <ul className="space-y-1 text-sm text-text-secondary">
          {(versions ?? []).map((v) => (
            <li key={v.id}>
              {t.versionLine(v.version, horaLocal(v.created_at))}
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
                <span className="text-text-secondary">{horaLocal(event.occurred_at)} · </span>
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
