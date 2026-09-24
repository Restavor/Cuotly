import Link from "next/link";

import { AutoSubmitForm } from "@/components/panel/AutoSubmitForm";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { addMonths } from "@/core/client-calendar";
import {
  ACTIVITY_GROUPS,
  activityGroup,
  activityKey,
  filterActivity,
  type ActivityParams,
  type ClientActivityKind,
} from "@/core/client-activity";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

const t = es.panelActivity;

export type ActivityItem = {
  readonly at: string;
  readonly kind: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly subject: string | null;
  readonly detail: string | null;
};

const ICONO: Record<ClientActivityKind, IconName> = {
  request_sent: "arrowRight",
  request_accepted: "tick",
  request_rejected: "xCircle",
  work_started: "clock",
  work_published: "check",
  request_cancelled: "close",
  correction_requested: "alert",
  menu_published: "dailyMenu",
  report_sent: "reports",
  quote_sent: "document",
  quote_accepted: "tick",
  charge_issued: "finance",
  receipt_uploaded: "upload",
  payment_recorded: "check",
  file_shared: "document",
};

type OpenKey = keyof typeof t.open;

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** A dónde lleva el botón del detalle: al sitio donde vive la cosa. */
function destino(
  item: ActivityItem,
  base: string,
  slug: string,
): string | null {
  switch (item.entity_type) {
    case "request":
      return `${base}/solicitudes/${item.entity_id}`;
    case "menu":
      return `${base}/menu-diario/${item.entity_id}`;
    case "report":
      return `/espacios/${slug}/informes/${item.entity_id}`;
    case "quote":
      return `${base}/facturacion/documentos?tab=presupuestos`;
    case "charge":
      return `${base}/facturacion/${item.entity_id}`;
    case "file":
      return `${base}/archivos`;
    default:
      return null;
  }
}

/**
 * R41 · la actividad e historial, con los datos ya leídos. Una línea de
 * tiempo del mes a la izquierda y el evento elegido a la derecha.
 */
export function ActivityView({
  items,
  failed,
  params,
  timeZone,
  slug,
  base,
  today,
}: {
  items: readonly ActivityItem[];
  failed: boolean;
  params: ActivityParams;
  timeZone: string;
  slug: string;
  /** `/espacios/<slug>/restaurantes/<id>`. */
  base: string;
  /** "YYYY-MM-DD" en la zona del espacio: el mes de hoy no se pasa de largo. */
  today: string;
}) {
  const eventos = filterActivity(items, params.group);
  const elegido =
    eventos.find((e) => activityKey(e) === params.selected) ?? null;
  const ruta = `${base}/actividad`;

  const enlace = (cambios: Partial<ActivityParams>) => {
    const p = { ...params, ...cambios };
    const u = new URLSearchParams();
    if (p.month !== today.slice(0, 7)) u.set("mes", p.month);
    if (p.group) u.set("tipo", p.group);
    if (p.selected) u.set("evento", p.selected);
    const s = u.toString();
    return `${ruta}${s ? `?${s}` : ""}`;
  };

  const nombreMes = mayuscula(
    enZona(`${params.month}-01`, timeZone, { month: "long", year: "numeric" }),
  );
  const esteMes = params.month >= today.slice(0, 7);
  const fecha = (at: string) =>
    enZona(at, timeZone, { day: "numeric", month: "short", year: "numeric" });
  const hora = (at: string) =>
    enZona(at, timeZone, { hour: "2-digit", minute: "2-digit" });
  const frase = (e: ActivityItem) =>
    t.sentences[e.kind as ClientActivityKind](e.subject ?? "");

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-4! sm:p-5!">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-text">
                {t.filterMonth}
              </p>
              <div className="flex items-center gap-1 rounded-[10px] border border-border bg-surface px-2 py-1.5">
                <Link
                  href={enlace({
                    month: addMonths(params.month, -1),
                    selected: null,
                  })}
                  aria-label={t.previousMonth}
                  className="rounded p-1 text-text-secondary hover:bg-soft-surface hover:text-text"
                >
                  <Icon name="arrowLeft" className="h-4 w-4" />
                </Link>
                <span className="flex min-w-40 items-center justify-center gap-2 text-sm font-semibold text-text">
                  <Icon
                    name="calendar"
                    className="h-4 w-4 text-text-secondary"
                  />
                  {nombreMes}
                </span>
                {esteMes ? (
                  <span className="w-6" />
                ) : (
                  <Link
                    href={enlace({
                      month: addMonths(params.month, 1),
                      selected: null,
                    })}
                    aria-label={t.nextMonth}
                    className="rounded p-1 text-text-secondary hover:bg-soft-surface hover:text-text"
                  >
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
            <AutoSubmitForm
              action={ruta}
              submitLabel={t.apply}
              className="flex items-end gap-2"
            >
              {params.month !== today.slice(0, 7) ? (
                <input type="hidden" name="mes" value={params.month} />
              ) : null}
              <label className="text-sm font-medium text-text">
                <span className="mb-1 block">{t.filterType}</span>
                <select
                  name="tipo"
                  defaultValue={params.group ?? ""}
                  className="min-w-48 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  <option value="">{t.filterTypeAll}</option>
                  {ACTIVITY_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {t.groups[g]}
                    </option>
                  ))}
                </select>
              </label>
            </AutoSubmitForm>
            <p className="ml-auto text-sm text-text-secondary">
              {t.count(eventos.length)}
            </p>
          </div>

          {failed ? (
            <EmptyState title={t.failedTitle} description={t.failedReason} />
          ) : eventos.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              description={
                params.group === null ? t.emptyReason : t.emptyFiltered
              }
            />
          ) : (
            <div className="relative">
              {/* La raya de la línea de tiempo: fuera de la lista, que solo admite `li`. */}
              <span
                aria-hidden="true"
                className="absolute bottom-3 left-[7px] top-3 w-0.5 bg-cuotly-green/30"
              />
              <ol className="space-y-2 pl-6">
                {eventos.map((e) => {
                  const clave = activityKey(e);
                  const activo = clave === params.selected;
                  const kind = e.kind as ClientActivityKind;
                  return (
                    <li key={clave} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-6 top-5 h-4 w-4 rounded-full border-2 border-surface bg-cuotly-green"
                      />
                      <Link
                        href={enlace({ selected: activo ? null : clave })}
                        aria-current={activo ? "true" : undefined}
                        className={`flex items-start gap-3 rounded-[10px] p-3 transition-colors hover:bg-soft-surface ${
                          activo ? "bg-cuotly-green/10" : ""
                        }`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
                          <Icon name={ICONO[kind]} className="h-5 w-5" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:gap-3">
                          <span className="shrink-0 text-sm sm:w-24">
                            <span className="font-semibold text-text sm:block">
                              {fecha(e.at)}
                            </span>
                            <span className="ml-2 text-xs text-text-secondary sm:ml-0 sm:block">
                              {hora(e.at)}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-text">
                              {t.kinds[kind]}
                            </span>
                            <span className="block text-sm text-text-secondary">
                              {frase(e)}
                            </span>
                            <span className="mt-1.5 inline-flex rounded-full bg-soft-surface px-2.5 py-0.5 text-xs font-medium text-text">
                              {t.groups[activityGroup(kind)]}
                            </span>
                          </span>
                        </span>
                        <Icon
                          name="chevronRight"
                          className="mt-1 h-4 w-4 shrink-0 text-text-secondary"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <h2 className="mb-4 text-base font-semibold text-primary-dark">
            {t.detailTitle}
          </h2>
          {elegido === null ? (
            <EmptyState title={t.pickTitle} description={t.pickReason} />
          ) : (
            <Detalle
              item={elegido}
              fecha={`${fecha(elegido.at)} · ${hora(elegido.at)}`}
              frase={frase(elegido)}
              href={destino(elegido, base, slug)}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function Detalle({
  item,
  fecha,
  frase,
  href,
}: {
  item: ActivityItem;
  fecha: string;
  frase: string;
  href: string | null;
}) {
  const kind = item.kind as ClientActivityKind;
  const abrir = t.open[item.entity_type as OpenKey] ?? null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
          <Icon name={ICONO[kind]} className="h-6 w-6" />
        </span>
        <div>
          <p className="text-lg font-semibold text-primary-dark">
            {t.kinds[kind]}
          </p>
          <p className="text-sm text-text-secondary">{fecha}</p>
        </div>
      </div>
      <p className="text-sm text-text">{frase}</p>
      {/* El resumen de la solicitud o el día del menú: el texto que ya es del restaurante. */}
      {item.detail ? (
        <p className="rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
          {item.detail}
        </p>
      ) : null}
      {href && abrir ? (
        <ButtonLink
          href={href}
          variant="secondary"
          className="w-full justify-between!"
        >
          {abrir}
          <Icon name="chevronRight" className="h-4 w-4" />
        </ButtonLink>
      ) : null}
    </div>
  );
}
