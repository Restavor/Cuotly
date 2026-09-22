import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { MenuAllergensCard } from "@/components/menu/MenuAllergensCard";
import { MenuPreview, menuDocumentFromRows } from "@/components/menu/MenuPreview";
import { InfoNote, RequestTimeline } from "@/components/panel/RequestPieces";
import { Card, PageHeader, StatusBadge, Tabs } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { menuPendingChanges, publicationSteps } from "@/core/client-menus";
import { menuCorrectionAvailability } from "@/core/daily-menu";
import { formatPriceCents } from "@/core/menu-render";
import { isMenuEditable, isMenuState, menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { enZona, fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../../timezone-load";
import { ActionPanel, CopyMenuForm, CorrectionForm, DetailsForm, VersionEditor } from "./MenuForms";
import { VersionComparison } from "./VersionComparison";

/**
 * Un menú, visto por el restaurante (Fase 2, Hito 10; RN-MEN-01 a 07,
 * 09, 10, 12), con el diseño definitivo en cuatro pestañas (`?vista=`):
 * Editor (R14, con A17 y A18), Vista previa y descarga (R16), Publicación
 * (R17) y Versiones (R18). Es la misma pantalla de siempre repartida: los
 * datos se leen una vez y cada pestaña enseña su parte.
 *
 * Lo que el dibujo pinta y aquí no está: "los cambios se guardan
 * automáticamente" (cada guardado es una versión, RN-MEN-03, y se hace al
 * pulsar), "Texto plano", la fecha y hora deseadas y la nota al pedir la
 * publicación (la hora la fija RN-MEN-07: antes de las 08:00 si llega
 * antes de las 21:00 del día anterior) y el autor de cada versión (el
 * restaurante no ve quién del equipo hizo qué, P7).
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

const VISTAS = ["editor", "vista-previa", "publicacion", "versiones"] as const;
type Vista = (typeof VISTAS)[number];

export default async function ClientMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string; menuId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id, menuId } = await params;
  const { vista: vistaParam } = await searchParams;
  const supabase = await createClient();
  const p = es.panelMenus;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: menu } = await supabase
    .from("menus")
    .select(
      "id, establishment_id, name, kind, target_date, template_id, state, current_version_id, published_at, published_version_id",
    )
    .eq("id", menuId)
    .eq("establishment_id", id)
    .maybeSingle();
  if (!menu || !isMenuState(menu.state)) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}/menu-diario`;
  const aqui = `${base}/${menuId}`;
  const vista: Vista = VISTAS.includes(vistaParam as Vista) ? (vistaParam as Vista) : "editor";

  const [
    { data: versions },
    { data: templates },
    { data: events },
    { data: downloads },
    { data: deadlineRows },
    { data: corrections },
    timezone,
    { data: establishment },
  ] = await Promise.all([
    supabase
      .from("menu_versions")
      .select(
        "id, version, starters, mains, desserts, drink, price_cents, note, allergen_note, after_cutoff, created_at",
      )
      .eq("menu_id", menuId)
      .order("version", { ascending: false }),
    supabase
      .from("menu_templates")
      .select("id, name, layout, background_color, text_color, accent_color, heading_text, footer_text, show_prices")
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
    supabase.from("establishments").select("name").eq("id", id).maybeSingle(),
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
  const template = templates?.find((tpl) => tpl.id === menu.template_id) ?? null;
  const templateName = template?.name ?? null;
  const canDownload = current !== null && menu.template_id !== null;

  const doc =
    template !== null && current !== null
      ? menuDocumentFromRows({
          establishmentName: establishment?.name ?? "",
          menuName: menu.name,
          targetDate: menu.target_date,
          version: current,
          template,
        })
      : null;
  const vacioVistaPrevia =
    template === null ? p.previewNoTemplate : current === null ? p.previewNoContent : p.previewUnknownLayout;

  // A18 · la última vez que se pidió publicar, del libro de estados.
  const ultimaPeticion =
    (events ?? []).find((e) => e.to_state === "publication_requested")?.occurred_at ?? null;
  const pendientes = menuPendingChanges({
    state: menu.state,
    versions: versions ?? [],
    lastRequestAt: ultimaPeticion,
  });

  const estadoBadge = (
    <StatusBadge tone={menuTone(menu.state)}>{es.naming.states.menu[menu.state]}</StatusBadge>
  );

  const vistaPrevia = (ancho: number) =>
    doc ? (
      <MenuPreview doc={doc} width={ancho} label={p.previewAlt(menu.name)} />
    ) : (
      <p className="text-sm text-text-secondary">{vacioVistaPrevia}</p>
    );

  const plazos = deadlines ? (
    <div className="space-y-1 text-sm">
      <p className="text-text">{t.cutoffLine(horaEnZona(deadlines.cutoff_at, timezone))}</p>
      <p className="text-text">{t.publishByLine(horaEnZona(deadlines.publish_by_at, timezone))}</p>
      <p className="text-text-secondary">
        {deadlines.guaranteed === null ? t.notRequested : deadlines.guaranteed ? t.guaranteed : t.notGuaranteed}
      </p>
    </div>
  ) : null;

  const botonTab = (destino: Vista, texto: string, principal: boolean, icono: "settings" | "share") => (
    <Link
      href={`${aqui}?vista=${destino}`}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold ${
        principal
          ? "bg-primary text-surface hover:bg-primary-dark"
          : "border border-cuotly-green bg-surface text-cuotly-green hover:bg-cuotly-green/10"
      }`}
    >
      <Icon name={icono} className="h-4 w-4" />
      {texto}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="text-sm text-primary underline-offset-2 hover:underline">
          {t.backToList}
        </Link>
      </div>
      <PageHeader title={menu.name} subtitle={p.editorSubtitle}>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          {/*
            El testid existe para los recorridos: el estado aparece también
            en el historial de la pestaña de publicación, y un `getByText`
            suelto encontraba los dos.
          */}
          <span data-testid="estado-del-menu">{estadoBadge}</span>
          <span>
            {current ? p.lastSaved(horaEnZona(current.created_at, timezone)) : p.neverSaved}
          </span>
          <span>
            {es.naming.menuKinds[menu.kind as MenuKindKey] ?? menu.kind} · {fechaCorta(menu.target_date)} ·{" "}
            {templateName ?? t.detailNoTemplate}
          </span>
        </div>
      </PageHeader>

      <Tabs
        label={p.menuTabsLabel}
        active={vista}
        tabs={[
          { key: "editor", label: p.menuTabs.editor, href: `${aqui}?vista=editor` },
          { key: "vista-previa", label: p.menuTabs.preview, href: `${aqui}?vista=vista-previa` },
          { key: "publicacion", label: p.menuTabs.publication, href: `${aqui}?vista=publicacion` },
          { key: "versiones", label: p.menuTabs.versions, href: `${aqui}?vista=versiones` },
        ]}
      />

      {/* A18 · lo guardado que todavía no está en la web. */}
      {pendientes && (vista === "editor" || vista === "versiones") ? (
        <div className="flex flex-wrap items-center gap-4 rounded-card border border-warning/60 bg-warning/10 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/25 text-primary-dark">
            <Icon name="info" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">
              {pendientes.kind === "not_requested" ? p.pendingNotRequestedTitle : p.pendingAfterRequestTitle}
            </p>
            <p className="text-sm text-text-secondary">
              {pendientes.kind === "not_requested"
                ? p.pendingNotRequestedBody(pendientes.version)
                : p.pendingAfterRequestBody(pendientes.version)}
            </p>
            {pendientes.kind === "saved_after_request" && pendientes.afterCutoff ? (
              <p className="text-sm text-text-secondary">{p.pendingAfterCutoff}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            {pendientes.kind === "not_requested"
              ? botonTab("publicacion", p.pendingRequestAction(pendientes.version), true, "share")
              : null}
            {vista !== "versiones" ? botonTab("versiones", p.pendingViewVersions, false, "settings") : null}
          </div>
        </div>
      ) : null}

      {vista === "editor" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <VersionEditor
              menuId={menuId}
              editable={editable}
              compareHref={`${aqui}?vista=versiones`}
              current={
                current
                  ? {
                      version: current.version,
                      starters: current.starters,
                      mains: current.mains,
                      desserts: current.desserts,
                      drink: current.drink,
                      priceCents: current.price_cents,
                      // §39 · la nota. `null` es una versión anterior a los
                      // alérgenos, y el editor arranca en blanco: no se
                      // inventa una nota que nadie escribió.
                      allergenNote: current.allergen_note,
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
          </div>
          <div className="space-y-6">
            <Card title={p.previewTitle}>
              <div className="flex flex-col items-center gap-3">
                {vistaPrevia(300)}
                {doc && current ? (
                  <p className="text-center text-xs text-text-secondary">{p.previewOfVersion(current.version)}</p>
                ) : null}
                {doc ? botonTab("vista-previa", p.openPreview, false, "settings") : null}
              </div>
            </Card>
            {/* §39 · la nota de alérgenos, para leerla. */}
            {current ? <MenuAllergensCard note={current.allergen_note} /> : null}
          </div>
        </div>
      ) : null}

      {vista === "vista-previa" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="flex justify-center lg:col-span-2">{vistaPrevia(520)}</Card>
          <div className="space-y-6">
            <Card title={t.downloadsTitle}>
              {canDownload ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    href={`${aqui}/descargar?formato=pdf`}
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-3 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
                  >
                    <Icon name="download" className="h-4 w-4" />
                    {t.downloadPdf}
                  </a>
                  <a
                    href={`${aqui}/descargar?formato=png`}
                    className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-3 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
                  >
                    <Icon name="image" className="h-4 w-4" />
                    {t.downloadPng}
                  </a>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">{t.downloadsNeedContent}</p>
              )}
              <div className="mt-3">
                <InfoNote title={p.downloadTitle}>{p.downloadNotPublish}</InfoNote>
              </div>
              {downloads && downloads.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-text-secondary">
                  <li className="font-medium text-text">{t.downloadsHistory(downloads.length)}</li>
                  {downloads.slice(0, 5).map((dl) => (
                    <li key={dl.id}>{t.downloadLine(dl.format, horaEnZona(dl.downloaded_at, timezone), dl.by_team)}</li>
                  ))}
                </ul>
              ) : null}
            </Card>

            <Card title={p.infoTitle}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-text-secondary">{p.infoDate}</dt>
                <dd className="text-text">{fechaCorta(menu.target_date)}</dd>
                <dt className="text-text-secondary">{p.infoTitleLabel}</dt>
                <dd className="text-text">{menu.name}</dd>
                <dt className="text-text-secondary">{p.infoPrice}</dt>
                <dd className="text-text">
                  {current?.price_cents != null ? formatPriceCents(current.price_cents) : "—"}
                </dd>
                <dt className="text-text-secondary">{p.infoTemplate}</dt>
                <dd className="text-text">{templateName ?? t.detailNoTemplate}</dd>
              </dl>
            </Card>

            <Card title={p.publicationStateTitle}>
              {estadoBadge}
              <div className="mt-3">{plazos}</div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {botonTab("editor", p.editContent, false, "settings")}
              {botonTab("publicacion", p.requestPublication, true, "share")}
            </div>
          </div>
        </div>
      ) : null}

      {vista === "publicacion" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title={p.menuDataTitle}>
              <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
                <div className="flex justify-center">{vistaPrevia(180)}</div>
                <div className="space-y-4 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                    <dt className="text-text-secondary">{p.infoDate}</dt>
                    <dd className="text-text">{fechaCorta(menu.target_date)}</dd>
                    <dt className="text-text-secondary">{p.versionLabel}</dt>
                    <dd className="text-text">{current ? p.versionCurrent(current.version) : p.neverSaved}</dd>
                    <dt className="text-text-secondary">{p.infoTemplate}</dt>
                    <dd className="text-text">{templateName ?? t.detailNoTemplate}</dd>
                  </dl>
                  {plazos ? (
                    <div>
                      <p className="mb-1 font-semibold text-text">{p.deadlinesTitle}</p>
                      {plazos}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card title={p.historyTitle}>
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

          <div className="space-y-6">
            <Card title={p.requestStateTitle}>
              {estadoBadge}
              <p className="mb-2 mt-4 text-sm font-semibold text-text">{p.afterSending}</p>
              <RequestTimeline
                orientation="vertical"
                showDates={false}
                steps={publicationSteps(menu.state).map((paso) => ({
                  key: paso.key,
                  status: paso.status,
                  label: p.pubSteps[paso.key].title,
                  dateLabel: null,
                  note: p.pubSteps[paso.key].body,
                }))}
              />
            </Card>
            <ActionPanel menuId={menuId} state={menu.state} idempotencyKey={randomUUID()} />
          </div>
        </div>
      ) : null}

      {vista === "versiones" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={p.versionListTitle}>
            {(versions ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">{p.neverSaved}</p>
            ) : (
              <ul className="space-y-3">
                {(versions ?? []).map((v) => (
                  <li
                    key={v.id}
                    className={`rounded-[10px] border p-3 ${
                      v.id === menu.current_version_id ? "border-l-4 border-cuotly-green" : "border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-soft-surface px-2 py-1 text-sm font-semibold text-text">
                        v{v.version}
                      </span>
                      {v.id === menu.published_version_id ? (
                        <StatusBadge tone="success">{p.versionPublished}</StatusBadge>
                      ) : null}
                      {v.after_cutoff ? <StatusBadge tone="warning">{p.versionAfterCutoff}</StatusBadge> : null}
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{horaEnZona(v.created_at, timezone)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/*
            R18 · comparar dos versiones. No pide nada al servidor: las
            versiones ya están aquí con su contenido, y comparar es cálculo
            (`src/core/menu-diff.ts`, con sus tests).
          */}
          <VersionComparison
            versions={(versions ?? []).map((v) => ({
              id: v.id,
              version: v.version,
              starters: v.starters ?? [],
              mains: v.mains ?? [],
              desserts: v.desserts ?? [],
              drink: v.drink,
              priceCents: v.price_cents,
              note: v.note,
            }))}
          />

          <div className="space-y-6">
            <Card title={p.actionsTitle}>
              <div className="space-y-4">
                {canDownload && current ? (
                  <div className="grid gap-2">
                    <a
                      href={`${aqui}/descargar?formato=pdf`}
                      className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
                    >
                      <Icon name="download" className="h-4 w-4" />
                      {p.downloadPdfOf(current.version)}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">{t.downloadsNeedContent}</p>
                )}
                <CopyMenuForm slug={slug} establishmentId={id} menuId={menuId} defaultCopyDate={menu.target_date} />
              </div>
            </Card>

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

            <InfoNote title={p.versionListTitle}>{p.versionsKept}</InfoNote>
          </div>
        </div>
      ) : null}
    </div>
  );
}
