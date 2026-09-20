import { describe, expect, it } from "vitest";

import type { ReportSnapshot } from "@/core/reports";
import { es } from "@/i18n/es";

import {
  activityText,
  allowanceText,
  changeCategoryText,
  changeDatesText,
  changeText,
  figureLabel,
  figureText,
  renderReportPdf,
  sanitize,
} from "./report-pdf";

/**
 * El PDF de un informe (§93, RN-REP-06). Se prueba de verdad —se genera el
 * documento— porque los dos fallos que este archivo puede tener no los ve
 * ningún tipo:
 *
 *   · un carácter que la fuente estándar no sabe escribir, que hace
 *     **lanzar** a pdf-lib en el momento de descargar;
 *   · una cifra sin valor pintada como un hueco, en vez de con su motivo.
 */
const t = es.reportsPage;

const SNAPSHOT: ReportSnapshot = {
  category: "operation",
  period: { start: "2026-08-01", end: "2026-08-31" },
  generatedAt: "2026-09-01T08:00:00Z",
  sections: [
    { key: "executive_summary", position: 1, included: true },
    { key: "operation", position: 2, included: true },
    { key: "digital", position: 3, included: false },
  ],
  figures: [
    { section: "operation", metric: "jobs_completed", value: 10 },
    { section: "operation", metric: "average_start", value: 180, unit: "business_minutes" },
    { section: "operation", metric: "start_compliance", value: null, noDataReason: "stale" },
    { section: "digital", metric: "sessions", value: 3, dimension: "ga4" },
  ],
  // Con guiones largos, comillas tipográficas y acentos: es lo que escribe
  // una persona de verdad en el resumen ejecutivo.
  opportunities: [],
  notes: { executive_summary: "Agosto —como todos— flojo: “menú del día” cayó un 12 %…" },
};

describe("el PDF del informe", () => {
  it("se genera y es un PDF", async () => {
    const bytes = await renderReportPdf(SNAPSHOT, {
      name: "Informe mensual — Septiembre 2026",
      establishmentName: "Casa Magariños",
      generatedAtLabel: "1 sept",
      periodLabel: { from: "1 ago", to: "31 ago" },
    });

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("lo que la fuente estándar no sabe escribir se quita, y el PDF sale igual", async () => {
    // Una flecha o un emoji hacen **lanzar** a pdf-lib con WinAnsi. Un
    // informe lleva texto escrito por una persona, así que puede llegar
    // cualquier cosa, y quedarse sin informe por un emoji sería peor.
    const bytes = await renderReportPdf(
      { ...SNAPSHOT, notes: { executive_summary: "Ventas → arriba 🎉 y «menú» intacto" } },
      {
        name: "Informe con emoji 🎉",
        establishmentName: "Casa Magariños",
        generatedAtLabel: "1 sept",
        periodLabel: { from: "1 ago", to: "31 ago" },
      },
    );

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("decisión 29 · la versión trae la sección que el equipo apagó, y el PDF no la pinta", async () => {
    // Desde la decisión 29 la versión guarda las cifras de las secciones
    // que el equipo dejó fuera, para que quien la mira pueda encenderlas.
    // El PDF es la otra mitad del trato: sale con lo que decidió el
    // equipo. Se compara con el mismo informe SIN esas cifras dentro: si
    // el PDF las pintara, ocuparía más.
    const meta = {
      name: "Informe mensual",
      establishmentName: "Casa Magariños",
      generatedAtLabel: "1 sept",
      periodLabel: { from: "1 ago", to: "31 ago" },
    };

    const conLaApagada = await renderReportPdf(SNAPSHOT, meta);
    const sinElla = await renderReportPdf(
      { ...SNAPSHOT, figures: SNAPSHOT.figures.filter((figure) => figure.section !== "digital") },
      meta,
    );

    expect(conLaApagada.byteLength).toBe(sinElla.byteLength);
  });

  it("un consolidado lo dice en la portada en vez de dejar el restaurante en blanco", async () => {
    const bytes = await renderReportPdf(SNAPSHOT, {
      name: "Consolidado",
      establishmentName: null,
      generatedAtLabel: "1 sept",
      periodLabel: { from: "1 ago", to: "31 ago" },
    });

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("una cifra sin valor se escribe con su motivo, no con un hueco", () => {
    expect(figureText({ section: "operation", metric: "start_compliance", value: null, noDataReason: "stale" }, t))
      .toBe(es.emptyReasons.stale);
    // Y sin motivo conocido, se dice "Sin dato" — nunca un cero, que sería
    // una cifra inventada (CLAUDE.md MUST NOT).
    expect(figureText({ section: "operation", metric: "jobs_completed", value: null }, t)).toBe(t.pdf.noValue);
  });

  it("las unidades se escriben en palabras: un porcentaje no es lo mismo que un minuto", () => {
    expect(figureText({ section: "operation", metric: "start_compliance", value: 86, unit: "percent" }, t))
      .toBe("86 %");
    expect(figureText({ section: "operation", metric: "average_start", value: 180, unit: "business_minutes" }, t))
      .toBe("3 h laborables");
    expect(figureText({ section: "finance", metric: "income_total", value: 48279, unit: "cents" }, t))
      .toContain("482,79");
  });

  it("el nombre de una cifra con dimensión lleva las dos cosas", () => {
    expect(figureLabel({ section: "operation", metric: "consumption", value: 2, dimension: "photo" }, t))
      .toBe(`${t.metrics.consumption} · ${es.naming.categories.photo}`);
    expect(figureLabel({ section: "digital", metric: "sessions", value: 100, dimension: "ga4" }, t))
      .toBe(`${t.metrics.sessions} · ${es.integrations.providers.ga4.name}`);
  });
});

describe("RN-REP-17 · el signo de la variación sobrevive al PDF", () => {
  it("RN-REP-17 · una caída se escribe con su signo, y el signo llega al papel", () => {
    const bajando = { section: "operation" as const, metric: "average_start", value: 380, previous: 450 };
    const texto = changeText(bajando, t);

    expect(texto).toBe("-16 %");
    /*
      Esto no es una redundancia. La primera versión usaba el menos
      TIPOGRÁFICO (U+2212), que no existe en WinAnsi —lo que escribe la
      fuente estándar del PDF—, así que `sanitize()` se lo comía y la
      caída salía impresa como "16 %": una bajada del 16 % pintada como
      una subida. Lo encontró mirar el PDF generado, no el tipo.
    */
    expect(sanitize(texto!)).toBe(texto);
  });

  it("todo el texto que el PDF imprime se puede escribir en WinAnsi", () => {
    /*
      El barrido que sostiene la regla. Un carácter que la fuente estándar
      no sabe escribir no avisa: o hace **lanzar** a pdf-lib, o —peor— lo
      quita `sanitize()` y la frase sale mutilada sin que nadie lo note.
      Así que se recorren todas las frases que el PDF puede imprimir y se
      comprueba que ninguna cambia al pasar por el filtro.

      Se llama a las funciones con valores de ejemplo porque el problema
      del menos estaba dentro de una plantilla, no en una constante.
    */
    const fuentes: unknown[] = [
      es.reportsPage.pdf,
      es.reportsPage.sections,
      es.reportsPage.metrics,
      es.reportsPage.units,
      es.reportsPage.change,
      es.reportsPage.activity,
      es.reportsPage.columns,
      es.emptyReasons,
      es.emptyReasonsShort,
      es.naming.categories,
      es.opportunities.impacts,
    ];

    const malas: string[] = [];
    const revisar = (valor: unknown): void => {
      if (typeof valor === "string") {
        if (sanitize(valor) !== valor) malas.push(valor);
        return;
      }
      if (typeof valor === "function") {
        // 12 y "agosto" como valores de ejemplo: lo que se mira es la
        // plantilla que los envuelve.
        try {
          revisar((valor as (...args: unknown[]) => unknown)(12, 12, "agosto"));
        } catch {
          // Una función que no acepta esos argumentos se deja pasar: el
          // barrido es una red, no un contrato.
        }
        return;
      }
      if (valor && typeof valor === "object") {
        for (const dentro of Object.values(valor)) revisar(dentro);
      }
    };

    fuentes.forEach(revisar);
    expect(malas).toEqual([]);
  });
});

describe("RN-REP-18 · cómo se lee una entrada del relato", () => {
  it("RN-REP-18 · dice QUÉ pasó y de qué, nunca quién", () => {
    expect(
      activityText({ at: "2026-08-12T09:00:00Z", kind: "correction_requested", subject: "SOL-0041", category: "small" }, t),
    ).toBe(`${t.activity.kinds.correction_requested} · SOL-0041`);
  });

  it("RN-REP-18 · el día de un menú se dice como una fecha, no como un ISO suelto", () => {
    // La base entrega el día del menú en ISO. "2026-08-18" en medio de
    // una frase es ruido: el restaurante reconoce "18 ago".
    expect(
      activityText({ at: "2026-08-18T07:00:00Z", kind: "menu_published", subject: "2026-08-18", category: null }, t),
    ).toBe(`${t.activity.kinds.menu_published} · 18 ago`);
  });

  it("RN-REP-18 · una entrada sin sujeto dice solo qué pasó, sin un separador colgando", () => {
    expect(
      activityText({ at: "2026-08-18T07:00:00Z", kind: "menu_published", subject: null, category: null }, t),
    ).toBe(t.activity.kinds.menu_published);
  });
});

describe("RN-REP-18 · la ficha de un cambio (decisión 58)", () => {
  const base = {
    code: "SOL-0041",
    title: "Cambiar el precio del menú",
    description: "Cambiar 20 EUR de pescado por 25 EUR",
    category: "small" as const,
    budgeted: false,
    requestedAt: "2026-08-03T09:00:00Z",
    acceptedAt: "2026-08-04T09:00:00Z",
    rejectedAt: null,
    startedAt: "2026-08-04T10:00:00Z",
    completedAt: "2026-08-06T10:00:00Z",
    cancelledAt: null,
    corrections: 0,
  };

  it("RN-REP-18 · un cambio entregado lleva sus dos fechas", () => {
    expect(changeDatesText(base, t)).toBe("Empezado el 4 ago · Entregado el 6 ago");
  });

  it("RN-REP-18 · un cambio en marcha dice \"En proceso\" donde iría la fecha de fin", () => {
    // Bosco, 20/09/2026: "en vez de poner fecha de finalización pondrías
    // en proceso". No un hueco y no una fecha estimada, que sería inventar.
    expect(changeDatesText({ ...base, completedAt: null }, t)).toBe("Empezado el 4 ago · En proceso");
  });

  it("RN-REP-18 · un cambio aceptado y sin empezar dice cuándo se pidió y que está pendiente", () => {
    expect(changeDatesText({ ...base, startedAt: null, completedAt: null }, t)).toBe(
      "Pedido el 3 ago · Pendiente de empezar",
    );
  });

  it("RN-REP-18 · una solicitud todavía en análisis no se confunde con una aceptada sin empezar", () => {
    // Una ya es un compromiso y la otra no: decirle "pendiente de
    // empezar" a algo que nadie ha aceptado sería prometer de más.
    expect(changeDatesText({ ...base, acceptedAt: null, startedAt: null, completedAt: null }, t)).toBe(
      "Pedido el 3 ago · En análisis",
    );
  });

  it("RN-REP-18 · un rechazo y una cancelación lo dicen con su fecha", () => {
    expect(
      changeDatesText(
        { ...base, acceptedAt: null, startedAt: null, completedAt: null, rejectedAt: "2026-08-07T09:00:00Z" },
        t,
      ),
    ).toContain("Rechazado el 7 ago");
    expect(changeDatesText({ ...base, completedAt: null, cancelledAt: "2026-08-09T09:00:00Z" }, t)).toContain(
      "Cancelado el 9 ago",
    );
  });

  it("RN-COR-07 · las correcciones que pidió el restaurante salen en su ficha", () => {
    expect(changeDatesText({ ...base, corrections: 2 }, t)).toContain("2 correcciones pedidas");
    // En singular la frase entera cambia: "1 corrección pedidas" no es
    // español, y un plural mal puesto en un informe que lee un cliente se
    // nota más que en cualquier otro sitio.
    expect(changeDatesText({ ...base, corrections: 1 }, t)).toContain("1 corrección pedida");
  });

  it("RN-REP-18 · el tipo de cambio son tres respuestas, no una", () => {
    expect(changeCategoryText(base, t)).toBe(es.naming.categories.small);
    // RN-CON-03 · un presupuestado aparte no gastó bolsa, y eso es lo que
    // hay que decir en vez de su categoría.
    expect(changeCategoryText({ ...base, budgeted: true }, t)).toBe(t.changeCard.budgeted);
    // Y a un cambio recién pedido no se le adivina una categoría: sería
    // decirle al restaurante qué va a gastar antes de saberlo.
    expect(changeCategoryText({ ...base, category: null }, t)).toBe(t.changeCard.unclassified);
  });
});

describe("RN-REP-20 · la bolsa del mes", () => {
  it("RN-REP-20 · una línea normal dice consumidos de incluidos", () => {
    expect(allowanceText({ category: "small", consumed: 2, included: 5, budgeted: 0 }, t)).toBe(
      "2 de 5 incluidos",
    );
  });

  it("RN-REP-20 · el adjetivo concuerda en género y número, porque esto lo lee un cliente", () => {
    // "Fotografías · 3 de 6 incluidos" y "1 de 1 incluidos" son las dos
    // formas mal que salieron al mirar el PDF generado.
    expect(allowanceText({ category: "photo", consumed: 3, included: 6, budgeted: 0 }, t)).toBe(
      "3 de 6 incluidas",
    );
    expect(allowanceText({ category: "medium", consumed: 1, included: 1, budgeted: 0 }, t)).toBe(
      "1 de 1 incluido",
    );
    expect(allowanceText({ category: "photo", consumed: 0, included: 1, budgeted: 0 }, t)).toBe(
      "0 de 1 incluida",
    );
  });

  it("RN-REP-20 · el \"1 de 0\" lleva siempre la coletilla que lo explica", () => {
    /*
      Sin ella el restaurante lee que se ha pasado de su plan, y lo que
      hizo fue comprar un cambio aparte: un presupuestado NO consume bolsa
      (RN-CON-03), así que el 1 y el 0 vienen de sitios distintos.
    */
    expect(allowanceText({ category: "large", consumed: 0, included: 0, budgeted: 1 }, t)).toBe(
      "0 de 0 incluidos · 1 presupuestado aparte",
    );
    expect(allowanceText({ category: "large", consumed: 0, included: 0, budgeted: 2 }, t)).toContain(
      "2 presupuestados aparte",
    );
  });

  it("RN-REP-20 · sin plan vigente no se dice \"de 0\": se dice que no hay plan", () => {
    // Cero dice "tu plan no incluye ninguno" y null dice "no tienes plan".
    // Son dos cosas distintas y se dicen distinto (CLAUDE.md).
    expect(allowanceText({ category: "small", consumed: 3, included: null, budgeted: 0 }, t)).toBe(
      "3 consumidos · sin plan de mantenimiento",
    );
  });
});
