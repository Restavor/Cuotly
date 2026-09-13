import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, StatusBadge } from "@/components/ui";
import { isPublicationOverdue } from "@/core/daily-menu";
import { FINAL_MENU_STATES, isMenuState, menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { AssignMenuForm, CorrectionsPanel, RefundForm, WorkerActions, type MenuCandidate, type MenuCorrectionRow } from "./TeamMenuForms";

/**
 * Un menú, visto por el equipo (Fase 2, Hito 11; RN-MEN-06/07/09/10,
 * RN-ASG-02/17, RN-COR-10).
 *
 * Es la ficha desde la que se trabaja la publicación (§61): asignar, pedir
 * información, descargar la plantilla generada (que pone "Listo para
 * publicar"), marcar publicado, registrar un error, devolver la
 * actualización, y las correcciones del menú publicado. La pantalla elige
 * qué formularios pintar por estado y por lo que el servidor dice de quien
 * mira (`has_capability`, la publicación que RLS le deja ver); quien decide
 * de verdad es la función de cada acción al pulsar.
 *
 * Los avisos enlazan aquí para todo el mundo (RN-NOT-04). Un cliente no es
 * miembro del espacio: se le reenvía a la ficha de su restaurante, que es
 * la suya y no enseña a nadie del equipo (P7).
 */
export const dynamic = "force-dynamic";

const t = es.dailyMenuTeam;

type MenuKindKey = keyof typeof es.naming.menuKinds;

function horaLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export default async function TeamMenuPage({ params }: { params: Promise<{ slug: string; menuId: string }> }) {
  const { slug, menuId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();

  // `menus` tiene privilegios de columna (P7): se enumeran las columnas.
  const { data: menu } = await supabase
    .from("menus")
    .select(
      "id, space_id, establishment_id, name, kind, target_date, template_id, state, current_version_id, published_at, published_version_id, published_template_id",
    )
    .eq("id", menuId)
    .maybeSingle();
  if (!menu || !isMenuState(menu.state)) notFound();

  // Un cliente ve el menú (es suyo) pero no el espacio: a su ficha.
  if (!space || space.id !== menu.space_id) {
    redirect(`/espacios/${slug}/restaurantes/${menu.establishment_id}/menu-diario/${menuId}`);
  }

  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    redirect(`/espacios/${slug}/restaurantes/${menu.establishment_id}/menu-diario/${menuId}`);
  }

  const now = new Date();
  const timeZone = space.timezone;

  const [
    { data: establishment },
    { data: versions },
    { data: template },
    { data: events },
    { data: downloads },
    { data: deadlineRows },
    { data: publications },
    { data: corrections },
    { data: canAssign },
    { data: canManage },
    { data: queueRows },
  ] = await Promise.all([
    supabase.from("establishments").select("id, name, code").eq("id", menu.establishment_id).maybeSingle(),
    supabase
      .from("menu_versions")
      .select("id, version, starters, mains, desserts, drink, price_cents, note, after_cutoff, created_at")
      .eq("menu_id", menuId)
      .order("version", { ascending: false }),
    menu.template_id
      ? supabase.from("menu_templates").select("id, name").eq("id", menu.template_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("menu_events")
      .select("id, from_state, to_state, reason, occurred_at")
      .eq("menu_id", menuId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("menu_downloads")
      .select("id, format, by_team, downloaded_at")
      .eq("menu_id", menuId)
      .order("downloaded_at", { ascending: false })
      .limit(5),
    supabase.rpc("menu_deadlines", { p_menu_id: menuId }),
    // Fila interna del equipo: RLS solo la da a quien gestiona o al asignado.
    supabase
      .from("menu_publications")
      .select(
        "id, requested_at, requested_before_cutoff, assigned_to, assigned_at, assignment_mode, published_at, published_by, cancelled_at",
      )
      .eq("menu_id", menuId)
      .order("requested_at", { ascending: false }),
    supabase
      .from("menu_corrections")
      .select("id, kind, description, requested_at, requested_before_cutoff, completed_at, completion_note")
      .eq("menu_id", menuId)
      .order("requested_at", { ascending: false }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "assign_jobs" }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_requests" }),
    supabase.rpc("team_menu_queue", { p_space_id: space.id }),
  ]);

  const queueRow = (queueRows ?? []).find((r) => r.menu_id === menuId) ?? null;
  const deadlines = deadlineRows?.[0] ?? null;
  const current = versions?.find((v) => v.id === menu.current_version_id) ?? null;
  const livePublication = (publications ?? []).find((p) => p.published_at === null && p.cancelled_at === null) ?? null;
  const lastPublication = (publications ?? [])[0] ?? null;
  const isAssignee = livePublication?.assigned_to === user.id || lastPublication?.assigned_to === user.id;
  const canAct = isAssignee || canManage === true;
  const closed = FINAL_MENU_STATES.includes(menu.state);
  const inFlight = !closed && menu.state !== "draft" && menu.state !== "prepared";
  const overdue = isPublicationOverdue({
    now,
    targetDate: menu.target_date,
    timezone: timeZone,
    guaranteed: deadlines?.guaranteed ?? null,
    published: menu.state === "published",
  });

  // Nombres de quien está asignado y de quien publicó: son del equipo y
  // esta pantalla es del equipo. El cliente nunca llega aquí.
  const personIds = [
    ...new Set(
      (publications ?? [])
        .flatMap((p) => [p.assigned_to, p.published_by])
        .filter((id): id is string => id !== null),
    ),
  ];
  const { data: people } = personIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", personIds)
    : { data: [] };
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  // Los candidatos solo se piden cuando hacen falta: la función exige
  // permiso de asignación y lanza a quien no lo tenga.
  let candidates: MenuCandidate[] = [];
  if (canAssign === true && inFlight) {
    const { data: rows } = await supabase.rpc("list_menu_candidates", { p_menu_id: menuId });
    const ids = (rows ?? []).map((r) => r.worker_id);
    const { data: candidatePeople } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const name = new Map((candidatePeople ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
    candidates = (rows ?? []).map((r) => ({
      workerId: r.worker_id,
      name: name.get(r.worker_id) ?? r.worker_id,
      loadPoints: r.active_load_points,
      menuCount: r.active_menu_count,
    }));
  }

  // §60 · si la publicación ya devolvió su actualización, se dice y no se
  // vuelve a ofrecer. El libro es la única fuente (RN-CON): un apunte de
  // devolución o crédito compensatorio con esa publicación.
  let alreadyRefunded = false;
  if (lastPublication) {
    const { data: credits } = await supabase
      .from("menu_update_entries")
      .select("id, entry_type")
      .eq("publication_id", lastPublication.id)
      .in("entry_type", ["return", "compensatory_credit"]);
    alreadyRefunded = (credits ?? []).length > 0;
  }

  const base = `/espacios/${slug}/menu-diario`;
  const downloadBase = `/espacios/${slug}/restaurantes/${menu.establishment_id}/menu-diario/${menuId}/descargar`;
  const canDownload = current !== null && menu.template_id !== null;
  const correctionRows: MenuCorrectionRow[] = (corrections ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    description: c.description,
    requestedAt: c.requested_at,
    requestedBeforeCutoff: c.requested_before_cutoff,
    completedAt: c.completed_at,
    completionNote: c.completion_note,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <Link href={base} className="text-sm text-primary underline-offset-2 hover:underline">
          {t.backToQueue}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-primary-dark">{menu.name}</h1>
        <p className="text-sm text-text-secondary">
          {t.detailSubtitle(
            establishment ? `${establishment.code} · ${establishment.name}` : "—",
            es.naming.menuKinds[menu.kind as MenuKindKey] ?? menu.kind,
            fechaCorta(menu.target_date),
          )}{" "}
          · {t.detailTemplate}: {template?.name ?? t.detailNoTemplate}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge tone={menuTone(menu.state)}>{es.naming.states.menu[menu.state]}</StatusBadge>
          {overdue ? <StatusBadge tone="danger">{t.overdueShort}</StatusBadge> : null}
        </div>
      </header>

      {deadlines ? (
        <Card title={t.deadlinesTitle}>
          <p className="text-sm text-text">{t.cutoffLine(horaLocal(deadlines.cutoff_at, timeZone))}</p>
          <p className="text-sm text-text">{t.publishByLine(horaLocal(deadlines.publish_by_at, timeZone))}</p>
          {deadlines.requested_at ? (
            <p className="text-sm text-text">{t.requestedLine(horaLocal(deadlines.requested_at, timeZone))}</p>
          ) : null}
          <p className="mt-2 text-sm text-text-secondary">
            {deadlines.guaranteed === null
              ? t.notRequested
              : overdue
                ? t.overdue
                : deadlines.guaranteed
                  ? t.guaranteed
                  : t.notGuaranteed}
          </p>
        </Card>
      ) : null}

      <Card title={t.publicationTitle}>
        {menu.state === "published" && menu.published_at ? (
          <p className="text-sm text-text">
            {lastPublication?.published_by && personName.get(lastPublication.published_by)
              ? t.publishedBy(personName.get(lastPublication.published_by)!, horaLocal(menu.published_at, timeZone))
              : t.publishedAt(horaLocal(menu.published_at, timeZone))}
          </p>
        ) : livePublication?.assigned_to ? (
          <p className="text-sm text-text">
            {livePublication.assigned_to === user.id
              ? t.assignedToSelf
              : t.assignedTo(personName.get(livePublication.assigned_to) ?? "—")}
            {livePublication.assignment_mode
              ? ` (${t.assignedMode[livePublication.assignment_mode as keyof typeof t.assignedMode] ?? livePublication.assignment_mode})`
              : ""}
          </p>
        ) : queueRow?.is_assigned ? (
          <p className="text-sm text-text-secondary">{t.assignedToSomeone}</p>
        ) : inFlight ? (
          <p className="text-sm text-text-secondary">{t.noAssignee}</p>
        ) : (
          <p className="text-sm text-text-secondary">{closed ? t.nothingToDo : t.notRequested}</p>
        )}
        {inFlight && !canAct ? <p className="mt-2 text-sm text-text-secondary">{t.noPermissionHint}</p> : null}
      </Card>

      {canAssign === true && inFlight ? (
        <AssignMenuForm menuId={menuId} candidates={candidates} reassign={livePublication?.assigned_to !== null && livePublication !== null} />
      ) : null}

      {canAct ? <WorkerActions menuId={menuId} state={menu.state} /> : null}

      <Card title={t.contentTitle(current?.version ?? null)}>
        {current ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-text">{t.starters}</dt>
            <dd className="text-text-secondary">{current.starters.join(" · ") || "—"}</dd>
            <dt className="font-medium text-text">{t.mains}</dt>
            <dd className="text-text-secondary">{current.mains.join(" · ") || "—"}</dd>
            <dt className="font-medium text-text">{t.desserts}</dt>
            <dd className="text-text-secondary">{current.desserts.join(" · ") || "—"}</dd>
            <dt className="font-medium text-text">{t.drink}</dt>
            <dd className="text-text-secondary">{current.drink ?? "—"}</dd>
            <dt className="font-medium text-text">{t.price}</dt>
            <dd className="text-text-secondary">
              {current.price_cents === null
                ? "—"
                : `${Math.trunc(current.price_cents / 100)},${String(current.price_cents % 100).padStart(2, "0")} €`}
            </dd>
            <dt className="font-medium text-text">{t.note}</dt>
            <dd className="text-text-secondary">{current.note ?? "—"}</dd>
          </dl>
        ) : (
          <p className="text-sm text-text-secondary">{t.contentEmpty}</p>
        )}
      </Card>

      <Card title={t.downloadsTitle}>
        {canDownload ? (
          <div className="flex flex-wrap gap-3">
            <a href={`${downloadBase}?formato=png`} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark">
              {t.downloadPng}
            </a>
            <a href={`${downloadBase}?formato=pdf`} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-soft-surface">
              {t.downloadPdf}
            </a>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{t.downloadsNeedContent}</p>
        )}
        <p className="mt-3 text-sm text-text-secondary">{t.downloadsHint}</p>
        {downloads && downloads.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-text-secondary">
            {downloads.map((d) => (
              <li key={d.id}>{es.dailyMenuClient.downloadLine(d.format, horaLocal(d.downloaded_at, timeZone), d.by_team)}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* RN-MEN-07: "el trabajador ve los cambios de versión y su hora". */}
      <Card title={t.versionsTitle}>
        <ul className="space-y-1 text-sm text-text-secondary">
          {(versions ?? []).map((v) => {
            const afterRequest =
              livePublication !== null && new Date(v.created_at).getTime() > new Date(livePublication.requested_at).getTime();
            return (
              <li key={v.id}>
                {t.versionLine(v.version, horaLocal(v.created_at, timeZone))}
                {v.after_cutoff ? ` · ${t.versionAfterCutoff}` : ""}
                {afterRequest ? ` · ${t.versionAfterRequest}` : ""}
              </li>
            );
          })}
        </ul>
      </Card>

      {canManage === true && lastPublication ? (
        <RefundForm publicationId={lastPublication.id} alreadyRefunded={alreadyRefunded} />
      ) : null}

      {menu.state === "published" || correctionRows.length > 0 ? (
        <CorrectionsPanel
          menuId={menuId}
          corrections={correctionRows}
          canAct={canAct}
          published={menu.state === "published"}
          timeZone={timeZone}
        />
      ) : null}

      <Card title={t.historyTitle}>
        {!events || events.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.historyEmpty}</p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="text-text-secondary">{horaLocal(event.occurred_at, timeZone)} · </span>
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
