import { describe, expect, it } from "vitest";

import { businessMinutesBetween, zonedTimeToUtc } from "./business-clock";
import { isMandatoryEvent } from "./notifications";
import {
  CLIENT_CONTEXT_KEYS,
  HELP_TOPICS,
  INCIDENT_CATEGORIES,
  INCIDENT_IMPACTS,
  INCIDENT_KINDS,
  INCIDENT_SIDES,
  INCIDENT_STATES,
  MEASURED_COMPONENTS,
  STATUS_COMPONENTS,
  STATUS_SEVERITIES,
  componentDisplayState,
  cuotlySupportCalendar,
  helpAudienceFor,
  incidentAwaitsSpace,
  incidentNeedsReason,
  incidentPriorityFor,
  incidentPriorityRank,
  incidentTransitionAllowed,
  isIncidentFinal,
  pickClientContext,
  supportIsOpenAt,
} from "./support";

/**
 * El soporte de Cuotly (PRD §34, RN-SOP; §131 a §133 y §157). Lo que se
 * vigila aquí es lo que es dominio puro: los catálogos, la tabla de
 * transiciones, la prioridad y qué se mide. Quién puede hacer qué lo
 * comprueba `supabase/tests/soporte_centro_de_ayuda_y_estado.sql` contra
 * la base, porque es donde tiene que ser verdad.
 */
describe("los catálogos de una incidencia (RN-SOP-02, RN-SOP-03)", () => {
  it("RN-SOP-02 · dos tipos, errores y sugerencias, y separados", () => {
    expect([...INCIDENT_KINDS]).toEqual(["error", "suggestion"]);
  });

  it("RN-SOP-03 · las categorías son los ocho temas de §133 más «otra»", () => {
    expect([...HELP_TOPICS]).toEqual([
      "first_steps",
      "requests",
      "jobs",
      "menus",
      "payments",
      "users",
      "integrations",
      "security",
    ]);
    expect([...INCIDENT_CATEGORIES]).toEqual([...HELP_TOPICS, "other"]);
  });

  it("RN-SOP-03 · cuatro niveles de impacto, y el crítico es uno de ellos", () => {
    expect([...INCIDENT_IMPACTS]).toEqual(["low", "medium", "high", "critical"]);
  });

  it("RN-SOP-03 · el contexto técnico son las cuatro claves de §131 y ninguna más", () => {
    expect([...CLIENT_CONTEXT_KEYS]).toEqual(["browser", "os", "screen", "error"]);
    // Lo que no es una de las cuatro no entra, aunque llegue.
    expect(
      pickClientContext({ browser: " Firefox 130 ", os: "", cookie: "secreto", error: "TypeError" }),
    ).toEqual({ browser: "Firefox 130", error: "TypeError" });
  });
});

describe("los seis estados y quién mueve cada transición (RN-SOP-04)", () => {
  it("RN-SOP-04 · son los seis de §131, en su orden", () => {
    expect([...INCIDENT_STATES]).toEqual([
      "open",
      "in_review",
      "needs_information",
      "in_progress",
      "resolved",
      "closed",
    ]);
  });

  it("RN-SOP-04 · el espacio no mueve una incidencia abierta: la lleva Cuotly", () => {
    for (const destino of INCIDENT_STATES) {
      expect(incidentTransitionAllowed("open", destino, "space"), `open -> ${destino}`).toBe(false);
    }
    for (const destino of ["in_review", "needs_information", "in_progress", "resolved", "closed"] as const) {
      expect(incidentTransitionAllowed("open", destino, "platform")).toBe(true);
    }
  });

  it("RN-SOP-04 · «necesita información» devuelve la pelota al espacio, que la deja en revisión", () => {
    expect(incidentTransitionAllowed("needs_information", "in_review", "space")).toBe(true);
    expect(incidentTransitionAllowed("needs_information", "resolved", "space")).toBe(false);
    expect(incidentTransitionAllowed("needs_information", "closed", "space")).toBe(false);
  });

  it("RN-SOP-04 · de «resuelta» el espacio cierra o reabre; Cuotly también puede cerrar", () => {
    expect(incidentTransitionAllowed("resolved", "closed", "space")).toBe(true);
    expect(incidentTransitionAllowed("resolved", "in_review", "space")).toBe(true);
    expect(incidentTransitionAllowed("resolved", "closed", "platform")).toBe(true);
    expect(incidentTransitionAllowed("resolved", "in_progress", "platform")).toBe(true);
  });

  it("RN-SOP-04 · «cerrada» es final por los dos lados", () => {
    expect(isIncidentFinal("closed")).toBe(true);
    for (const destino of INCIDENT_STATES) {
      for (const lado of INCIDENT_SIDES) {
        expect(incidentTransitionAllowed("closed", destino, lado), `closed -> ${destino} (${lado})`).toBe(false);
      }
    }
  });

  it("RN-SOP-04 · ningún estado se mueve a sí mismo, y toda casilla de la tabla existe", () => {
    for (const from of INCIDENT_STATES) {
      for (const to of INCIDENT_STATES) {
        for (const lado of INCIDENT_SIDES) {
          const permitido = incidentTransitionAllowed(from, to, lado);
          expect(typeof permitido).toBe("boolean");
          if (from === to) expect(permitido).toBe(false);
        }
      }
    }
  });

  it("RN-SOP-04 · exigen motivo pedir información y cerrar sin resolver; cerrar lo resuelto, no", () => {
    expect(incidentNeedsReason("open", "needs_information")).toBe(true);
    expect(incidentNeedsReason("in_review", "closed")).toBe(true);
    expect(incidentNeedsReason("resolved", "closed")).toBe(false);
    expect(incidentNeedsReason("open", "resolved")).toBe(false);
  });

  it("§20.4 · esperan algo del espacio las que piden información y las resueltas sin confirmar", () => {
    expect(INCIDENT_STATES.filter(incidentAwaitsSpace)).toEqual(["needs_information", "resolved"]);
  });
});

describe("la prioridad se deriva (RN-SOP-05)", () => {
  it("RN-SOP-05 · crítica por encima del plan; Agency alta; Pro estándar; sin plan, estándar", () => {
    expect(incidentPriorityFor("error", "critical", "pro")).toBe("critical");
    expect(incidentPriorityFor("error", "low", "agency")).toBe("high");
    expect(incidentPriorityFor("error", "high", "pro")).toBe("standard");
    // Lectura 6 de la decisión 35: Restavor y el espacio de demostración
    // no tienen plan de Cuotly.
    expect(incidentPriorityFor("error", "high", null)).toBe("standard");
  });

  it("RN-SOP-02 · una sugerencia no tiene prioridad, tenga el impacto que tenga", () => {
    expect(incidentPriorityFor("suggestion", null, "agency")).toBeNull();
    expect(incidentPriorityRank(null)).toBeGreaterThan(incidentPriorityRank("standard"));
    expect(incidentPriorityRank("critical")).toBeLessThan(incidentPriorityRank("high"));
  });
});

describe("el reloj humano de §132 (RN-SOP-06)", () => {
  const madrid = (y: number, m: number, d: number, h: number, min: number) =>
    zonedTimeToUtc(y, m, d, h, min, "Europe/Madrid");

  it("RN-SOP-06 · un viernes a las 19:00 hasta el sábado a las 10:00 son 240 minutos: 3 h del viernes y 1 h del sábado", () => {
    // Viernes 14:00–22:00: de 19:00 a 22:00 son 180; sábado 09:00–14:30: de
    // 09:00 a 10:00 son 60. Total 240.
    const minutos = businessMinutesBetween(
      madrid(2026, 9, 18, 19, 0),
      madrid(2026, 9, 19, 10, 0),
      cuotlySupportCalendar(),
    );
    expect(minutos).toBe(240);
  });

  it("RN-SOP-06 · un festivo de Cuotly usa el horario de fin de semana, no cierra", () => {
    // Martes 15/09/2026 marcado como festivo: 09:00–14:30 en vez de 14:00–22:00.
    const con = businessMinutesBetween(
      madrid(2026, 9, 15, 8, 0),
      madrid(2026, 9, 15, 23, 0),
      cuotlySupportCalendar(["2026-09-15"]),
    );
    const sin = businessMinutesBetween(
      madrid(2026, 9, 15, 8, 0),
      madrid(2026, 9, 15, 23, 0),
      cuotlySupportCalendar(),
    );
    expect(con).toBe(330 + 300);
    expect(sin).toBe(480);
  });

  it("RN-SOP-06 · «se puede enviar a cualquier hora» es otra cosa que «hay alguien»: a las 03:00 no lo hay", () => {
    expect(supportIsOpenAt(madrid(2026, 9, 16, 3, 0))).toBe(false);
    expect(supportIsOpenAt(madrid(2026, 9, 16, 15, 0))).toBe(true);
    expect(supportIsOpenAt(madrid(2026, 9, 20, 15, 0))).toBe(false); // domingo 14:30–16:30, cerrado
  });
});

describe("la página de estado (RN-SOP-12, RN-SOP-13)", () => {
  it("RN-SOP-12 · los cinco componentes de §133 y las tres gravedades", () => {
    expect([...STATUS_COMPONENTS]).toEqual(["app", "auth", "files", "notifications", "integrations"]);
    expect([...STATUS_SEVERITIES]).toEqual(["degraded", "outage", "maintenance"]);
  });

  it("RN-SOP-12 · autenticación y archivos no se miden, y no se les inventa un «operativo»", () => {
    expect(MEASURED_COMPONENTS).not.toContain("auth");
    expect(MEASURED_COMPONENTS).not.toContain("files");
    expect(
      componentDisplayState({ component: "auth", measured: false, measuredState: null, declared: [] }),
    ).toBe("unmeasured");
  });

  it("RN-SOP-12 · lo declarado manda sobre lo medido, y la peor gravedad gana", () => {
    expect(
      componentDisplayState({
        component: "notifications",
        measured: true,
        measuredState: "operational",
        declared: [{ severity: "maintenance" }, { severity: "outage" }],
      }),
    ).toBe("outage");
    expect(
      componentDisplayState({
        component: "notifications",
        measured: true,
        measuredState: "degraded",
        declared: [],
      }),
    ).toBe("degraded");
  });
});

describe("avisos y audiencias (RN-SOP-10, RN-SOP-15)", () => {
  it("RN-SOP-15 · ninguno de los tres avisos de incidencias es obligatorio", () => {
    expect(isMandatoryEvent("incident_opened")).toBe(false);
    expect(isMandatoryEvent("incident_updated")).toBe(false);
    expect(isMandatoryEvent("incident_replied")).toBe(false);
  });

  it("RN-SOP-10 · cada rol del armazón cae en una audiencia, y el restaurante en «client»", () => {
    expect(helpAudienceFor("owner")).toBe("owner");
    expect(helpAudienceFor("worker")).toBe("worker");
    expect(helpAudienceFor("client")).toBe("client");
    expect(helpAudienceFor("client_daily_menu")).toBe("client");
  });
});
