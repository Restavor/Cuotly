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

  it("los estados posteriores a la aceptación no tienen ninguna transición implementada todavía (quedan para hitos posteriores)", () => {
    const postAcceptance: RequestState[] = [
      "in_progress",
      "published",
      "correction_requested",
      "in_correction",
      "closed",
      "cancelled_before_start",
      "cancelled_after_start",
    ];
    for (const state of postAcceptance) {
      const asOrigin = REQUEST_TRANSITIONS.some((t) => t.from === state);
      const asDestination = REQUEST_TRANSITIONS.some((t) => t.to === state);
      expect(asOrigin, `${state} no debería ser origen de ninguna transición del Hito 4`).toBe(false);
      expect(asDestination, `${state} no debería ser destino de ninguna transición del Hito 4`).toBe(false);
    }
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
