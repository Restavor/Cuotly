import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  CLIENT_CALENDAR_KINDS,
  addMonths,
  eventsByDay,
  filterByKind,
  gridBounds,
  monthGrid,
  readClientCalendarParams,
  upcomingEvents,
  type ClientCalendarEvent,
  type ClientCalendarKind,
  type ClientCalendarParams,
} from "@/core/client-calendar";
import { todayInTimeZone } from "@/core/finance";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";
import { loadClientCalendar } from "./calendar-load";

/**
 * R21 (mes) y R22 (agenda) · el calendario del restaurante.
 *
 * Los eventos se derivan en el servidor de lo que el restaurante puede
 * leer (`loadClientCalendar()`); los filtros, el mes y el evento elegido
 * viven en la dirección, como en el resto del panel.
 *
 * Lo que el dibujo pinta y aquí no está: la vista "Semana" (con mes y
 * agenda se ve lo mismo, y una tercera vista sería más código que
 * mantener sin nada nuevo que enseñar) y la foto del evento en la agenda
 * (los eventos no tienen foto).
 */
export const dynamic = "force-dynamic";

const t = es.panelCalendar;

const COLOR: Record<ClientCalendarKind, string> = {
  menu: "bg-cuotly-green",
  request: "bg-warning",
  renewal: "bg-info",
  report: "bg-primary",
  charge: "bg-danger",
};

/** El círculo del icono. El ámbar va de fondo claro con el trazo oscuro: el
 *  blanco sobre ámbar no pasa el contraste AA (contrast.test.ts). */
const CIRCULO: Record<ClientCalendarKind, string> = {
  menu: "bg-cuotly-green text-surface",
  request: "bg-warning/25 text-primary-dark",
  renewal: "bg-info text-surface",
  report: "bg-primary text-surface",
  charge: "bg-danger text-surface",
};

const ICONO: Record<ClientCalendarKind, IconName> = {
  menu: "dailyMenu",
  request: "request",
  renewal: "crown",
  report: "reports",
  charge: "finance",
};

function sumarDias(dia: string, n: number): string {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function ClientCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, zona] = await Promise.all([
    supabase.from("establishments").select("id").eq("id", id).maybeSingle(),
    loadEstablishmentTimezone(supabase, id),
  ]);
  if (!establishment) notFound();

  const hoy = todayInTimeZone(new Date(), zona);
  const q = readClientCalendarParams(await searchParams, hoy);
  const rejilla = gridBounds(q.month);
  const desde = rejilla.from < hoy ? rejilla.from : hoy;
  const hastaAgenda = sumarDias(hoy, 180);
  const hasta = rejilla.to > hastaAgenda ? rejilla.to : hastaAgenda;

  const todos = await loadClientCalendar(supabase, { slug, establishmentId: id, timeZone: zona, from: desde, to: hasta });
  const eventos = filterByKind(todos, q.kind);
  const porDia = eventsByDay(eventos);
  const proximos = upcomingEvents(eventos, hoy);

  const base = `/espacios/${slug}/restaurantes/${id}/calendario`;
  const enlace = (cambios: Partial<ClientCalendarParams>) => {
    const p = { ...q, ...cambios };
    const u = new URLSearchParams();
    if (p.view === "agenda") u.set("vista", "agenda");
    if (p.month !== hoy.slice(0, 7)) u.set("mes", p.month);
    if (p.kind) u.set("tipo", p.kind);
    if (p.selected) u.set("evento", p.selected);
    const s = u.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };

  const nombreMes = (mes: string) => mayuscula(enZona(`${mes}-01`, zona, { month: "long", year: "numeric" }));
  const fechaLarga = (dia: string) => enZona(dia, zona, { day: "numeric", month: "long", year: "numeric" });
  const fechaCorta = (dia: string) => enZona(dia, zona, { day: "numeric", month: "short", year: "numeric" });
  const semanaCorta = (dia: string) => enZona(dia, zona, { weekday: "short" });

  const chip = (clave: ClientCalendarKind | null, texto: string) => {
    const activo = q.kind === clave;
    return (
      <Link
        key={clave ?? "todos"}
        href={enlace({ kind: clave, selected: null })}
        aria-current={activo ? "true" : undefined}
        className={`inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-sm font-semibold ${
          activo ? "border-primary bg-primary text-surface" : "border-border bg-surface text-text hover:bg-soft-surface"
        }`}
      >
        {clave ? <Icon name={ICONO[clave]} className="h-4 w-4" /> : null}
        {texto}
      </Link>
    );
  };

  const vistas = (
    <nav aria-label={t.viewsLabel} className="inline-flex overflow-hidden rounded-[10px] border border-border">
      {(["mes", "agenda"] as const).map((v) => (
        <Link
          key={v}
          href={enlace({ view: v, selected: null })}
          aria-current={q.view === v ? "page" : undefined}
          className={`px-5 py-2 text-sm font-semibold ${
            q.view === v ? "bg-primary text-surface" : "bg-surface text-text hover:bg-soft-surface"
          }`}
        >
          {t.views[v]}
        </Link>
      ))}
    </nav>
  );

  const fila = (e: ClientCalendarEvent) => (
    <span className="flex items-start gap-1.5">
      <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${COLOR[e.kind]}`} />
      {/*
        Página 134 del diseño móvil · en el teléfono cada día es una
        casilla de 50 px y solo cabe el punto de color. El texto sigue ahí
        para quien usa lector de pantalla (`sr-only`) y vuelve a verse
        desde `sm`; lo completo de cada día está en la Agenda.
      */}
      <span className="sr-only min-w-0 sm:not-sr-only">
        <span className="line-clamp-2 text-xs font-medium text-text">{e.title}</span>
        {e.time ? <span className="block text-xs text-text-secondary">{e.time}</span> : null}
      </span>
    </span>
  );

  const siguiente = upcomingEvents(todos, hoy, 1)[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={q.view === "agenda" ? t.agendaSubtitle : t.subtitle} actions={vistas} />

      <nav aria-label={t.kindsLabel} className="flex flex-wrap gap-2">
        {chip(null, t.all)}
        {CLIENT_CALENDAR_KINDS.map((k) => chip(k, t.kinds[k]))}
      </nav>

      {q.view === "mes" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="min-w-0 space-y-4 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={enlace({ month: addMonths(q.month, -1) })}
                aria-label={t.previousMonth}
                className="rounded-[10px] border border-border bg-surface p-2 hover:bg-soft-surface"
              >
                <Icon name="arrowLeft" className="h-5 w-5" />
              </Link>
              <h2 className="text-center text-xl font-bold text-primary-dark sm:min-w-[200px] sm:text-2xl">{nombreMes(q.month)}</h2>
              <Link
                href={enlace({ month: addMonths(q.month, 1) })}
                aria-label={t.nextMonth}
                className="rounded-[10px] border border-border bg-surface p-2 hover:bg-soft-surface"
              >
                <Icon name="arrowRight" className="h-5 w-5" />
              </Link>
              <Link
                href={enlace({ month: hoy.slice(0, 7) })}
                className="ml-auto rounded-[10px] border border-cuotly-green bg-surface px-4 py-2 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
              >
                {t.today}
              </Link>
            </div>

            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="w-full table-fixed border-collapse sm:min-w-[640px]">
                <thead>
                  <tr>
                    {t.weekdays.map((d) => (
                      <th key={d} className="border-b border-border py-2 text-center text-sm font-semibold text-text">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(q.month).map((semana) => (
                    <tr key={semana[0].day}>
                      {semana.map(({ day, inMonth }) => {
                        const delDia = porDia.get(day) ?? [];
                        return (
                          <td key={day} className="h-14 border border-border p-1 align-top sm:h-28 sm:p-2">
                            <p
                              className={`text-sm ${
                                day === hoy
                                  ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-cuotly-green font-bold text-surface"
                                  : inMonth
                                    ? "font-semibold text-text"
                                    : "text-text-secondary"
                              }`}
                            >
                              {Number(day.slice(8))}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {delDia.slice(0, 2).map((e) => (
                                <li key={e.id}>
                                  <Link href={e.href} className="block hover:underline">
                                    {fila(e)}
                                  </Link>
                                </li>
                              ))}
                              {delDia.length > 2 ? (
                                <li>
                                  <Link
                                    href={enlace({ view: "agenda", selected: delDia[2].id })}
                                    className="text-xs font-semibold text-cuotly-green"
                                  >
                                    {t.more(delDia.length - 2)}
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {eventos.every((e) => e.day.slice(0, 7) !== q.month) ? (
              <p className="text-sm text-text-secondary">{t.monthEmpty}</p>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card title={nombreMes(addMonths(q.month, 1))}>
              <table className="w-full text-center text-xs">
                <thead>
                  <tr>
                    {t.weekdays.map((d) => (
                      <th key={d} className="pb-1 font-medium text-text-secondary">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthGrid(addMonths(q.month, 1)).map((semana) => (
                    <tr key={semana[0].day}>
                      {semana.map(({ day, inMonth }) => (
                        <td key={day} className="py-1">
                          <Link
                            href={enlace({ month: day.slice(0, 7) })}
                            className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full ${
                              day === hoy ? "bg-cuotly-green/20 font-bold text-text" : inMonth ? "text-text" : "text-text-secondary"
                            }`}
                          >
                            {Number(day.slice(8))}
                            {porDia.has(day) ? (
                              <span aria-hidden="true" className="absolute bottom-0 h-1 w-1 rounded-full bg-cuotly-green" />
                            ) : null}
                          </Link>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title={t.nextEventTitle}>
              {siguiente ? (
                <Link href={siguiente.href} className="flex gap-3 rounded-[10px] border border-border p-3 hover:bg-soft-surface">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${CIRCULO[siguiente.kind]}`}>
                    <Icon name={ICONO[siguiente.kind]} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-text-secondary">{fechaCorta(siguiente.day)}</span>
                    <span className="block font-semibold text-text">{siguiente.title}</span>
                    {siguiente.detail ? (
                      <span className="block truncate text-xs text-text-secondary">{siguiente.detail}</span>
                    ) : null}
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-text-secondary">{t.nextEventNone}</p>
              )}
            </Card>

            <Card title={t.legendTitle}>
              <ul className="space-y-2 text-sm text-text">
                {CLIENT_CALENDAR_KINDS.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-3 w-3 rounded-full ${COLOR[k]}`} />
                    {t.kindsSingular[k]}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <AgendaView
          proximos={proximos}
          seleccionado={proximos.find((e) => e.id === q.selected) ?? proximos[0] ?? null}
          enlace={(sel) => enlace({ selected: sel })}
          nombreMes={nombreMes}
          fechaCorta={fechaCorta}
          fechaLarga={fechaLarga}
          semanaCorta={semanaCorta}
        />
      )}
    </div>
  );
}

function AgendaView({
  proximos,
  seleccionado,
  enlace,
  nombreMes,
  fechaCorta,
  fechaLarga,
  semanaCorta,
}: {
  proximos: readonly ClientCalendarEvent[];
  seleccionado: ClientCalendarEvent | null;
  enlace: (selected: string) => string;
  nombreMes: (mes: string) => string;
  fechaCorta: (dia: string) => string;
  fechaLarga: (dia: string) => string;
  semanaCorta: (dia: string) => string;
}) {
  const meses = [...new Set(proximos.map((e) => e.day.slice(0, 7)))];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title={t.upcomingTitle}>
        {proximos.length === 0 ? (
          <EmptyState title={t.upcomingTitle} description={t.upcomingEmpty} />
        ) : (
          <div className="space-y-5">
            {meses.map((mes) => (
              <section key={mes}>
                <h3 className="mb-2 text-lg font-semibold text-primary-dark">{nombreMes(mes)}</h3>
                <ul className="space-y-2">
                  {proximos
                    .filter((e) => e.day.slice(0, 7) === mes)
                    .map((e) => {
                      const activo = e.id === seleccionado?.id;
                      return (
                        <li key={e.id}>
                          <Link
                            href={enlace(e.id)}
                            aria-current={activo ? "true" : undefined}
                            className={`flex items-center gap-4 rounded-[10px] border p-3 hover:bg-soft-surface ${
                              activo ? "border-l-4 border-cuotly-green" : "border-border"
                            }`}
                          >
                            <span className="w-24 shrink-0">
                              <span className="block font-semibold text-text">{fechaCorta(e.day)}</span>
                              <span className="block text-sm text-text-secondary">{semanaCorta(e.day)}</span>
                            </span>
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${CIRCULO[e.kind]}`}>
                              <Icon name={ICONO[e.kind]} className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-text">{e.title}</span>
                              {e.stateLabel ? <span className="block text-sm text-text-secondary">{e.stateLabel}</span> : null}
                            </span>
                            {e.time ? <span className="text-sm text-text-secondary">{e.time}</span> : null}
                            <Icon name="chevronRight" className="h-4 w-4 text-text-secondary" />
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card>
        {seleccionado ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-primary-dark">{seleccionado.title}</h2>
            {seleccionado.stateLabel ? <StatusBadge tone="info">{seleccionado.stateLabel}</StatusBadge> : null}
            <dl className="space-y-3 text-sm">
              <div className="flex gap-3">
                <Icon name="calendar" className="mt-0.5 h-5 w-5 text-text-secondary" />
                <div>
                  <dt className="text-text-secondary">{t.detailDate}</dt>
                  <dd className="text-text">{fechaLarga(seleccionado.day)}</dd>
                </div>
              </div>
              {seleccionado.time ? (
                <div className="flex gap-3">
                  <Icon name="clock" className="mt-0.5 h-5 w-5 text-text-secondary" />
                  <div>
                    <dt className="text-text-secondary">{t.detailTime}</dt>
                    <dd className="text-text">{seleccionado.time}</dd>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-3">
                <Icon name="document" className="mt-0.5 h-5 w-5 text-text-secondary" />
                <div>
                  <dt className="text-text-secondary">{t.detailType}</dt>
                  <dd className="text-text">{t.kindsSingular[seleccionado.kind]}</dd>
                </div>
              </div>
              {seleccionado.detail ? (
                <div className="flex gap-3">
                  <Icon name="messages" className="mt-0.5 h-5 w-5 text-text-secondary" />
                  <div>
                    <dt className="text-text-secondary">{t.detailInfo}</dt>
                    <dd className="whitespace-pre-wrap text-text">{seleccionado.detail}</dd>
                  </div>
                </div>
              ) : null}
            </dl>
            <Link
              href={seleccionado.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              <Icon name="share" className="h-4 w-4" />
              {t.open[seleccionado.kind]}
            </Link>
            {seleccionado.kind === "request" ? <InfoNote title={t.kindsSingular.request}>{t.teamWillAnswer}</InfoNote> : null}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{t.detailEmpty}</p>
        )}
      </Card>
    </div>
  );
}
