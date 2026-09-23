import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { INTEGRATION_PROVIDERS, type IntegrationProvider, type MetricPoint, previousWindow, summaryWindow } from "@/core/integrations";
import { es } from "@/i18n/es";

import { DataSectionNav, DigitalSection } from "./DigitalSections";
import type { DigitalDataView, ProviderData } from "./integrations-load";
import { DATA_SECTION_TABS, parseDataSection } from "./tabs";

/**
 * "Informes y datos" por secciones (maquetas 09 a 12 y las seis vistas
 * "sin datos"; vista 22 del restaurante). Lo que se vigila:
 *
 *   · Los cinco motivos de §178 con su nombre en la tabla "Estado de las
 *     fuentes", y las palabras del diseño para la conexión hecha que aún
 *     no trajo nada ("Esperando primera sincronización" / "primer análisis").
 *   · Sin ninguna cifra, el hueco de cada sección con su título y el botón
 *     "Gestionar integraciones" solo para quien gestiona.
 *   · Con cifra, las cifras de la ventana con su variación frente a los 28
 *     días anteriores, y nunca una de relleno (RN-INT-07, CLAUDE.md).
 *   · Oportunidades dice que es el Hito 15 y no ofrece "Añadir oportunidad".
 */
const t = es.integrations;

afterEach(cleanup);

const HOY = "2026-09-14";
const window = summaryWindow(HOY);
const anterior = previousWindow(window);

function punto(metric: string, day: string, value: number, dimension = "", unit: string | null = null): MetricPoint {
  return { metric, dimension, period_start: day, period_end: day, value, unit };
}

/** N días seguidos hacia atrás desde el último de la ventana, con el mismo valor. */
function dias(metric: string, value: number, n: number, dimension = "", desde = window.to): MetricPoint[] {
  const out: MetricPoint[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    out.push(punto(metric, d.toISOString().slice(0, 10), value, dimension));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function fuente(overrides: Partial<ProviderData> & { provider: IntegrationProvider }): ProviderData {
  return {
    status: "connected",
    reason: null,
    lastSuccessAt: "2026-09-14T03:00:00Z",
    lastSyncAt: "2026-09-14T03:00:00Z",
    lastError: null,
    coveredDays: 28,
    points: [],
    ...overrides,
  };
}

function vista(fuentes: Partial<Record<IntegrationProvider, Partial<ProviderData>>>): DigitalDataView {
  return {
    window,
    previousWindow: anterior,
    timezone: "Europe/Madrid",
    providers: INTEGRATION_PROVIDERS.map((provider) =>
      fuente({ provider, status: "not_connected", reason: "not_connected", lastSuccessAt: null, lastSyncAt: null, coveredDays: 0, ...fuentes[provider] }),
    ),
  };
}

const GESTION = "/r/1?vista=gestion&bloque=integraciones";

describe("Vista sin datos 1/6 · Resumen · «Estado de las fuentes»", () => {
  it("§178 · las cinco fuentes con su estado, las palabras del diseño para la conexión sin datos, y el motivo en «Información»", () => {
    render(
      <DigitalSection
        section="summary"
        manageHref={GESTION}
        view={vista({
          ga4: {},
          search_console: { status: "connected", reason: "no_data_yet", lastSuccessAt: null },
          business_profile: { status: "pending_authorization", reason: "not_connected" },
          clarity: { status: "error", reason: "error", lastError: "HTTP 503", lastSuccessAt: "2026-09-10T03:00:00Z" },
          pagespeed: { status: "connected", reason: "no_data_yet", lastSuccessAt: null },
        })}
      />,
    );

    const fila = (provider: IntegrationProvider) => screen.getByTestId(`source-${provider}`).closest("tr")!;
    expect(within(fila("ga4")).getByText(t.states.not_connected)).toBeInTheDocument();
    expect(within(fila("ga4")).getByText(t.sourceInfo.not_connected)).toBeInTheDocument();
    expect(within(fila("search_console")).getByText(t.waitingFirstSync)).toBeInTheDocument();
    expect(within(fila("search_console")).getByText(t.sourceInfo.no_data_yet)).toBeInTheDocument();
    expect(within(fila("business_profile")).getByText(t.states.pending_authorization)).toBeInTheDocument();
    expect(within(fila("business_profile")).getByText(t.sourceInfo.pending_authorization)).toBeInTheDocument();
    expect(within(fila("clarity")).getByText(t.states.error)).toBeInTheDocument();
    expect(within(fila("clarity")).getByText(t.sourceInfo.error)).toBeInTheDocument();
    expect(within(fila("clarity")).getByText(/10 sept 2026/)).toBeInTheDocument();
    expect(within(fila("pagespeed")).getByText(t.waitingFirstAnalysis)).toBeInTheDocument();
    expect(within(fila("pagespeed")).getByText(t.sourceInfo.no_analysis_yet)).toBeInTheDocument();

    // Sin ninguna cifra: el hueco del diseño con su botón.
    expect(screen.getByText(t.sections.summary.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.manageIntegrations })).toHaveAttribute("href", GESTION);
  });

  it("con alguna fuente con cifra no hay hueco: la tabla dice hasta cuándo llega el dato; y quien no gestiona no ve el botón", () => {
    render(
      <DigitalSection
        section="summary"
        manageHref={null}
        view={vista({ ga4: { status: "connected", reason: null, points: dias("users", 10, 28) } })}
      />,
    );
    expect(screen.queryByText(t.sections.summary.emptyTitle)).toBeNull();
    expect(screen.queryByRole("link", { name: t.manageIntegrations })).toBeNull();
    expect(screen.getByText(t.sourceInfo.ok("13 sept 2026"))).toBeInTheDocument();
  });

  it("si no se pudieron leer los datos se dice, no se pinta «ninguna conectada»", () => {
    render(<DigitalSection section="summary" manageHref={GESTION} view={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent(es.emptyReasons.error);
  });
});

describe("Vistas sin datos 2/6 a 5/6 · una sección sin cifra", () => {
  it("Analítica sin GA4: el hueco con su título, «Gestionar integraciones» y la tabla con solo su fuente", () => {
    render(<DigitalSection section="analytics" manageHref={GESTION} view={vista({})} />);
    expect(screen.getByText(t.sections.analytics.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.sections.analytics.emptyHint)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.manageIntegrations })).toHaveAttribute("href", GESTION);
    expect(screen.getByTestId("source-ga4")).toBeInTheDocument();
    expect(screen.queryByTestId("source-search_console")).toBeNull();
    expect(screen.getByText(t.sourcesFootnote)).toBeInTheDocument();
    // Ninguna cifra de relleno.
    expect(screen.queryByText(/^\d[\d.]*$/)).toBeNull();
  });

  it("Rendimiento sin análisis: «Esperando primer análisis» y el motivo de PageSpeed", () => {
    render(
      <DigitalSection
        section="performance"
        manageHref={GESTION}
        view={vista({ pagespeed: { status: "connected", reason: "no_data_yet", lastSuccessAt: null } })}
      />,
    );
    expect(screen.getByText(t.sections.performance.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.waitingFirstAnalysis)).toBeInTheDocument();
  });

  it("Vista sin datos 6/6 · Oportunidades dice que es el Hito 15 y no ofrece añadir ninguna", () => {
    render(<DigitalSection section="opportunities" manageHref={GESTION} view={vista({})} />);
    expect(screen.getByText(t.sections.opportunities.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /añadir oportunidad/i })).toBeNull();
  });
});

describe("Maqueta 10 · Analítica y búsqueda con cifra", () => {
  it("GA4: usuarios y sesiones de la ventana con su variación, la gráfica con tabla, los dispositivos y las páginas más visitadas", () => {
    const points = [
      ...dias("users", 10, 28),
      ...dias("users", 5, 28, "", anterior.to),
      ...dias("sessions", 20, 28),
      ...dias("sessions", 25, 28, "", anterior.to),
      ...dias("sessions_by_device", 15, 28, "mobile"),
      ...dias("sessions_by_device", 5, 28, "desktop"),
      ...dias("page_views_by_page", 30, 28, "/carta"),
      ...dias("page_views_by_page", 12, 28, "/"),
    ];
    render(<DigitalSection section="analytics" manageHref={GESTION} view={vista({ ga4: { status: "connected", reason: null, lastSuccessAt: "2026-09-14T03:00:00Z", points } })} />);

    const ga4 = screen.getByTestId("digital-ga4");
    expect(ga4).toHaveAttribute("data-reason", "ok");
    const usuarios = within(ga4).getByTestId("stat-users");
    expect(within(usuarios).getByText("280")).toBeInTheDocument();
    expect(within(usuarios).getByText(/\+100 %/)).toBeInTheDocument();
    const sesiones = within(ga4).getByTestId("stat-sessions");
    expect(within(sesiones).getByText("560")).toBeInTheDocument();
    expect(within(sesiones).getByText(/-20 %/)).toBeInTheDocument();
    // La antigüedad va en la cabecera de la tarjeta, junto al nombre de la fuente.
    expect(screen.getByText(/Datos hasta 13 sept 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sincronizado el 14 sept 2026/)).toBeInTheDocument();

    // La gráfica: una imagen con nombre, leyenda de dos series y su tabla.
    const grafica = within(ga4).getByTestId("chart-users-sessions");
    expect(within(grafica).getByRole("img", { name: t.usersSessionsTitle })).toBeInTheDocument();
    expect(within(grafica).getByText(t.chartTableToggle)).toBeInTheDocument();
    expect(within(grafica).getAllByRole("row").length).toBeGreaterThan(28);

    // Dispositivos: porcentajes reales, no de ejemplo.
    const dispositivos = within(ga4).getByTestId("chart-devices");
    expect(within(dispositivos).getByText("75 %")).toBeInTheDocument();
    expect(within(dispositivos).getByText("25 %")).toBeInTheDocument();

    const paginas = within(ga4).getByTestId("top-pages");
    const filas = within(paginas).getAllByRole("row");
    expect(filas[1]).toHaveTextContent("/carta");
    expect(filas[1]).toHaveTextContent("840");
  });

  it("Búsqueda: Search Console con cifra y Business Profile sin conectar, cada uno con lo suyo; la posición mejora al bajar", () => {
    const points = [
      ...dias("clicks", 4, 28),
      ...dias("clicks", 4, 28, "", anterior.to),
      ...dias("impressions", 100, 28),
      ...dias("ctr", 0.04, 28),
      ...dias("position", 8, 28),
      ...dias("position", 10, 28, "", anterior.to),
      ...dias("clicks_by_query", 3, 28, "restaurante magariños"),
    ];
    render(
      <DigitalSection
        section="search"
        manageHref={GESTION}
        view={vista({ search_console: { status: "connected", reason: null, points } })}
      />,
    );

    const sc = screen.getByTestId("digital-search_console");
    expect(within(within(sc).getByTestId("stat-clicks")).getByText("112")).toBeInTheDocument();
    expect(within(within(sc).getByTestId("stat-clicks")).getByText(/^=/)).toBeInTheDocument();
    const posicion = within(sc).getByTestId("stat-position");
    expect(within(posicion).getByText("8,0")).toBeInTheDocument();
    // Bajar de 10 a 8 es -20 %, y es una mejora (texto accesible "sube"/"baja" aparte del color).
    expect(within(posicion).getByText(/-20 %/)).toHaveClass("text-success");
    expect(within(within(sc).getByTestId("top-queries")).getByText("restaurante magariños")).toBeInTheDocument();
    expect(within(sc).getByText("4,0 %")).toBeInTheDocument();

    const bp = screen.getByTestId("digital-business_profile");
    expect(bp).toHaveAttribute("data-reason", "not_connected");
    expect(within(bp).getByText(es.emptyReasons.not_connected)).toBeInTheDocument();
  });

  it("Rendimiento: la puntuación por estrategia con el día del análisis, y las métricas de laboratorio formateadas", () => {
    const points = [
      punto("performance_score_by_strategy", "2026-09-10", 78, "mobile", "score"),
      punto("performance_score_by_strategy", "2026-09-10", 92, "desktop", "score"),
      punto("performance_score_by_strategy", "2026-09-03", 60, "mobile", "score"),
      punto("lcp_ms_by_strategy", "2026-09-10", 2800, "mobile", "ms"),
      punto("lcp_ms_by_strategy", "2026-09-10", 1400, "desktop", "ms"),
      punto("inp_ms_by_strategy", "2026-09-10", 180, "mobile", "ms"),
      punto("cls_by_strategy", "2026-09-10", 0.08, "mobile", "score"),
    ];
    render(
      <DigitalSection
        section="performance"
        manageHref={GESTION}
        view={vista({ pagespeed: { status: "connected", reason: null, coveredDays: 2, points } })}
      />,
    );
    const ps = screen.getByTestId("digital-pagespeed");
    expect(within(within(ps).getByTestId("score-mobile")).getByText("78")).toBeInTheDocument();
    expect(within(within(ps).getByTestId("score-desktop")).getByText("92")).toBeInTheDocument();
    expect(within(ps).getAllByText(t.measuredOn("10 sept 2026")).length).toBeGreaterThan(0);
    expect(within(ps).getByText("2,8 s")).toBeInTheDocument();
    expect(within(ps).getByText("1,4 s")).toBeInTheDocument();
    expect(within(ps).getByText("180 ms")).toBeInTheDocument();
    expect(within(ps).getByText("0,08")).toBeInTheDocument();
    // Lo que no se midió es un guion en su celda, no un cero.
    expect(within(ps).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("RN-INT-07 · el dato viejo se enseña como viejo, con su fecha, y nunca como actual (A16)", () => {
    render(
      <DigitalSection
        section="behavior"
        manageHref={GESTION}
        view={vista({ clarity: { status: "connected", reason: "stale", lastSuccessAt: "2026-09-01T03:00:00Z", points: dias("sessions", 100, 28, "", "2026-09-01") } })}
      />,
    );
    // A16 · lo viejo no se calla ni se hace pasar por actual: franja
    // "Datos desactualizados", fecha de la última pasada buena y, aparte,
    // "Últimos datos disponibles" con el día hasta el que llegan.
    const clarity = screen.getByTestId("digital-clarity");
    expect(clarity).toHaveAttribute("data-reason", "stale");
    expect(within(clarity).getByText(t.syncProblem.badge)).toBeInTheDocument();
    expect(within(clarity).getByText(t.syncProblem.lastData)).toBeInTheDocument();
    expect(within(clarity).getByText(t.dataUntil("1 sept 2026"))).toBeInTheDocument();
    // Con la ventana a medias no se compara con la anterior.
    expect(within(clarity).queryByText(t.changeVsPrevious)).toBeNull();
    expect(within(clarity).queryByText(t.changeNoPrevious)).toBeNull();
  });
});

describe("la subnavegación de «Informes y datos»", () => {
  it("seis enlaces en el orden del diseño, con la sección activa marcada", () => {
    render(<DataSectionNav active={parseDataSection("busqueda")} hrefFor={(s) => `/r/1/datos?seccion=${s.slug}`} />);
    const enlaces = screen.getAllByRole("link");
    expect(enlaces.map((e) => e.textContent)).toEqual(DATA_SECTION_TABS.map((s) => es.establishmentSheet.dataSections[s.key]));
    expect(screen.getByRole("link", { name: es.establishmentSheet.dataSections.search })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: es.establishmentSheet.dataSections.analytics })).toHaveAttribute("href", "/r/1/datos?seccion=analitica");
  });
});

describe("A16 · Error de sincronización", () => {
  it("RN-INT-07 · la fuente que falla dice qué pasa, cuándo fue la última pasada buena y enseña sus últimos datos, sin «Reintentar»", () => {
    const points = [...dias("users", 10, 20, "", "2026-09-06"), ...dias("sessions", 20, 20, "", "2026-09-06")];
    render(
      <DigitalSection
        section="analytics"
        manageHref={GESTION}
        view={vista({
          ga4: {
            status: "error",
            reason: "error",
            lastSuccessAt: "2026-09-07T07:30:00Z",
            lastSyncAt: "2026-09-14T08:00:00Z",
            lastError: "invalid_grant",
            points,
          },
        })}
      />,
    );
    const ga4 = screen.getByTestId("digital-ga4");
    expect(ga4).toHaveAttribute("data-reason", "error");
    expect(within(ga4).getByRole("alert")).toHaveTextContent(t.syncProblem.errorTitle(es.integrations.providers.ga4.name));
    expect(within(ga4).getByText(t.syncProblem.badge)).toBeInTheDocument();
    expect(within(ga4).getByText(/7 sept 2026/)).toBeInTheDocument();
    expect(within(ga4).getByText(/14 sept 2026/)).toBeInTheDocument();
    expect(within(ga4).getByText("invalid_grant")).toBeInTheDocument();
    expect(within(ga4).getByRole("link", { name: t.syncProblem.reviewConnection })).toHaveAttribute("href", GESTION);
    expect(within(ga4).getByText(t.syncProblem.lastData)).toBeInTheDocument();
    // Las cifras son las que hay, no de relleno: 20 días de 10 usuarios.
    expect(within(within(ga4).getByTestId("stat-users")).getByText("200")).toBeInTheDocument();
    expect(within(ga4).queryByRole("button", { name: /reintentar|sincronizar/i })).toBeNull();
  });

  it("sin datos anteriores dice el motivo en lugar de cifras, y quien no gestiona no ve «Revisar conexión»", () => {
    render(
      <DigitalSection
        section="search"
        manageHref={null}
        view={vista({
          search_console: { status: "connected", reason: null, points: dias("clicks", 1, 28) },
          business_profile: { status: "error", reason: "error", lastSuccessAt: null, lastSyncAt: "2026-09-14T08:00:00Z" },
        })}
      />,
    );
    const bp = screen.getByTestId("digital-business_profile");
    expect(bp).toHaveAttribute("data-reason", "error");
    expect(within(bp).getByText(t.syncProblem.never)).toBeInTheDocument();
    expect(within(bp).getByText(es.emptyReasons.error)).toBeInTheDocument();
    expect(within(bp).queryByRole("link", { name: t.syncProblem.reviewConnection })).toBeNull();
  });
});
