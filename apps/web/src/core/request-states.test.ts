import { describe, expect, it } from "vitest";
import {
  REQUEST_STATES,
  REQUEST_TRANSITIONS,
  canTransitionRequestState,
  findRequestTransition,
  isRequestState,
  type RequestState,
} from "./request-states";

describe("request-states — RN-REQ, PRD §9.2", () => {
  it("RN-REQ-01: el enum tiene los catorce estados exactos del PRD, en orden", () => {
    expect(REQUEST_STATES).toEqual([
      "draft",
      "received",
      "analyzing",
      "needs_information",
      "pending_internal_validation",
      "pending_client_acceptance",
      "accepted",
      "in_progress",
      "published",
      "correction_requested",
      "in_correction",
      "closed",
      "cancelled_before_start",
      "cancelled_after_start",
      "rejected",
    ]);
  });

  it("isRequestState reconoce los estados válidos y rechaza cualquier otro texto", () => {
    expect(isRequestState("draft")).toBe(true);
    expect(isRequestState("rejected")).toBe(true);
    expect(isRequestState("en_curso")).toBe(false);
    expect(isRequestState("")).toBe(false);
  });

  it("HU-10: el restaurante puede enviar un borrador (draft -> received)", () => {
    expect(canTransitionRequestState("draft", "received", "client")).toBe(true);
    // Nadie más que el propio restaurante envía su borrador.
    expect(canTransitionRequestState("draft", "received", "staff")).toBe(false);
    expect(canTransitionRequestState("draft", "received", "system")).toBe(false);
  });

  it("RN-CLS-01: el análisis automático corre sin intervención humana (received -> analyzing -> pending_internal_validation)", () => {
    expect(canTransitionRequestState("received", "analyzing", "system")).toBe(true);
    expect(canTransitionRequestState("analyzing", "pending_internal_validation", "system")).toBe(true);
    // Ni el cliente ni el equipo disparan estos dos pasos a mano.
    expect(canTransitionRequestState("received", "analyzing", "client")).toBe(false);
    expect(canTransitionRequestState("received", "analyzing", "staff")).toBe(false);
  });

  it("HU-11 / RN-CLS-03: solo el equipo (propietario o administrador) valida la clasificación", () => {
    expect(canTransitionRequestState("pending_internal_validation", "pending_client_acceptance", "staff")).toBe(
      true,
    );
    expect(canTransitionRequestState("pending_internal_validation", "pending_client_acceptance", "client")).toBe(
      false,
    );
  });

  it("HU-13: el equipo pide información y el cliente puede responderla, cerrando el ciclo", () => {
    expect(canTransitionRequestState("pending_internal_validation", "needs_information", "staff")).toBe(true);
    expect(canTransitionRequestState("pending_internal_validation", "needs_information", "client")).toBe(false);
    expect(canTransitionRequestState("needs_information", "pending_internal_validation", "client")).toBe(true);
    expect(canTransitionRequestState("needs_information", "pending_internal_validation", "staff")).toBe(false);
  });

  it("HU-14 / RN-REQ-03: solo el equipo rechaza una solicitud imposible, no prestada o fuera de servicio", () => {
    expect(canTransitionRequestState("pending_internal_validation", "rejected", "staff")).toBe(true);
    expect(canTransitionRequestState("pending_internal_validation", "rejected", "client")).toBe(false);
  });

  it("HU-12: el cliente acepta o rechaza la propuesta final, nadie más", () => {
    expect(canTransitionRequestState("pending_client_acceptance", "accepted", "client")).toBe(true);
    expect(canTransitionRequestState("pending_client_acceptance", "accepted", "staff")).toBe(false);
    expect(canTransitionRequestState("pending_client_acceptance", "rejected", "client")).toBe(true);
    expect(canTransitionRequestState("pending_client_acceptance", "rejected", "staff")).toBe(false);
  });

  it("por defecto deniega: ninguna transición fuera de la tabla está permitida", () => {
    expect(canTransitionRequestState("draft", "accepted", "client")).toBe(false);
    expect(canTransitionRequestState("accepted", "in_progress", "staff")).toBe(false);
    expect(canTransitionRequestState("rejected", "draft", "client")).toBe(false);
    expect(canTransitionRequestState("closed", "published", "system")).toBe(false);
  });

  it("Hito 6: los estados de ejecución ya son alcanzables, y ninguno quedó suelto", () => {
    const jobExecutionStates: RequestState[] = [
      "in_progress",
      "published",
      "correction_requested",
      "in_correction",
      "closed",
    ];
    for (const state of jobExecutionStates) {
      const asDestination = REQUEST_TRANSITIONS.some((t) => t.to === state);
      expect(asDestination, `${state} debería ser alcanzable desde el Hito 6`).toBe(true);
    }
    // RN-COR-08: `closed` es terminal, nada sale de él.
    expect(REQUEST_TRANSITIONS.some((t) => t.from === "closed")).toBe(false);
  });

  it("HU-18 / HU-20 / HU-23: el recorrido de ejecución de la solicitud, con sus actores", () => {
    // El responsable pulsa Comenzar y publica; no hay ninguna transición de
    // aprobación previa del supervisor entre las dos (RN-JOB-10).
    expect(canTransitionRequestState("accepted", "in_progress", "worker")).toBe(true);
    expect(canTransitionRequestState("in_progress", "published", "worker")).toBe(true);
    expect(canTransitionRequestState("accepted", "published", "worker")).toBe(false);

    // HU-23: la corrección mínima la pide el cliente; el equipo la ejecuta.
    expect(canTransitionRequestState("published", "correction_requested", "client")).toBe(true);
    expect(canTransitionRequestState("published", "correction_requested", "staff")).toBe(false);
    expect(canTransitionRequestState("correction_requested", "in_correction", "worker")).toBe(true);
    expect(canTransitionRequestState("in_correction", "published", "worker")).toBe(true);

    // RN-COR-07 / RN-JOB-12: un error del equipo se corrige sin que el
    // cliente haya pedido nada.
    expect(canTransitionRequestState("published", "in_correction", "worker")).toBe(true);

    // RN-COR-08: al cerrarse la ventana, la solicitud queda cerrada.
    expect(canTransitionRequestState("published", "closed", "system")).toBe(true);
  });

  it("RN-JOB-04 / CA-06: el cliente cancela una solicitud ya aceptada, hacia antes o después de empezar", () => {
    expect(canTransitionRequestState("accepted", "cancelled_before_start", "client")).toBe(true);
    expect(canTransitionRequestState("accepted", "cancelled_after_start", "client")).toBe(true);
    // Nadie del equipo cancela en nombre del cliente en este hito.
    expect(canTransitionRequestState("accepted", "cancelled_before_start", "staff")).toBe(false);
    expect(canTransitionRequestState("accepted", "cancelled_after_start", "staff")).toBe(false);
    // Ninguna de las dos es origen de otra transición: son terminales.
    expect(REQUEST_TRANSITIONS.some((t) => t.from === "cancelled_before_start")).toBe(false);
    expect(REQUEST_TRANSITIONS.some((t) => t.from === "cancelled_after_start")).toBe(false);
  });

  describe("RN-SLA-01 a 03: qué le pasa a T1 en cada transición", () => {
    it("RN-SLA-01: enviar la solicitud arranca T1", () => {
      expect(findRequestTransition("draft", "received", "client")?.t1).toBe("start");
    });

    it("RN-SLA-03: validar la clasificación detiene T1", () => {
      expect(findRequestTransition("pending_internal_validation", "pending_client_acceptance", "staff")?.t1).toBe(
        "stop",
      );
    });

    it("RN-SLA-03: pedir información pausa T1, y la respuesta del cliente lo reanuda", () => {
      expect(findRequestTransition("pending_internal_validation", "needs_information", "staff")?.t1).toBe("pause");
      expect(findRequestTransition("needs_information", "pending_internal_validation", "client")?.t1).toBe(
        "resume",
      );
    });

    it("RN-SLA-03: rechazar la solicitud detiene T1", () => {
      expect(findRequestTransition("pending_internal_validation", "rejected", "staff")?.t1).toBe("stop");
    });

    it("el paso automático de análisis no toca T1: sigue corriendo mientras dura", () => {
      expect(findRequestTransition("received", "analyzing", "system")?.t1).toBeNull();
      expect(findRequestTransition("analyzing", "pending_internal_validation", "system")?.t1).toBeNull();
    });
  });
});
