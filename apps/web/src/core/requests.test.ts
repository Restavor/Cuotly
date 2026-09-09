import { describe, expect, it } from "vitest";

import {
  consumptionEstimate,
  counterIsRunning,
  requestHeadline,
  requestTone,
  t1StopCause,
} from "./requests";
import { REQUEST_STATES } from "./request-states";
import type { TimerEvent } from "./timer-events";

const evento = (type: TimerEvent["type"], iso: string): TimerEvent => ({
  type,
  occurredAt: new Date(iso),
});

describe("el titular de una solicitud (§20.4, HU-11)", () => {
  it("es la primera frase de lo que escribió el restaurante, sin el punto", () => {
    expect(requestHeadline("Cambiar el precio del menú de 18 € a 19 € en la carta.")).toBe(
      "Cambiar el precio del menú de 18 € a 19 € en la carta",
    );
  });

  it("corta en la primera frase cuando hay varias", () => {
    expect(
      requestHeadline("Actualizar los precios de la carta. El menú sube a 19 € desde el lunes."),
    ).toBe("Actualizar los precios de la carta");
  });

  it("conserva la interrogación y la exclamación, que sí son parte de la frase", () => {
    expect(requestHeadline("¿Podéis cambiar el horario del sábado? Cerramos a las 23:00.")).toBe(
      "¿Podéis cambiar el horario del sábado?",
    );
  });

  it("recorta por palabra entera cuando la frase no cabe", () => {
    const titular = requestHeadline(
      "Rehacer la página de grupos y celebraciones con el formulario nuevo de reservas y las fotografías del comedor privado",
      40,
    );
    expect(titular).toBe("Rehacer la página de grupos y…");
    expect(titular.length).toBeLessThanOrEqual(41);
  });

  it("normaliza los saltos de línea y los espacios de más", () => {
    expect(requestHeadline("  Cambiar\n\n el   teléfono  ")).toBe("Cambiar el teléfono");
  });

  it("un texto vacío devuelve vacío en vez de reventar", () => {
    expect(requestHeadline("   ")).toBe("");
  });
});

describe("el tono de la insignia de estado (§21.4, CA-21)", () => {
  it("da un tono a los quince estados de RN-REQ-01, sin dejar ninguno fuera", () => {
    for (const estado of REQUEST_STATES) {
      expect(requestTone(estado)).toBeTruthy();
    }
  });

  it("lo cancelado y lo rechazado se leen igual de mal", () => {
    expect(requestTone("cancelled_before_start")).toBe("danger");
    expect(requestTone("cancelled_after_start")).toBe("danger");
    expect(requestTone("rejected")).toBe("danger");
  });

  it("lo que espera a alguien avisa, y lo terminado no", () => {
    expect(requestTone("pending_client_acceptance")).toBe("warning");
    expect(requestTone("needs_information")).toBe("warning");
    expect(requestTone("published")).toBe("success");
    expect(requestTone("closed")).toBe("success");
  });
});

describe("si el contador sigue corriendo (RN-SLA-03, CA-10)", () => {
  it("corre mientras el último evento sea un arranque o una reanudación", () => {
    expect(counterIsRunning([evento("started", "2026-09-07T09:00:00Z")])).toBe(true);
    expect(
      counterIsRunning([
        evento("started", "2026-09-07T09:00:00Z"),
        evento("paused", "2026-09-07T11:00:00Z"),
        evento("resumed", "2026-09-08T09:00:00Z"),
      ]),
    ).toBe(true);
  });

  it("RN-SLA-03 · se para al pedir información o al pasar al cliente", () => {
    expect(
      counterIsRunning([
        evento("started", "2026-09-07T09:00:00Z"),
        evento("paused", "2026-09-07T11:00:00Z"),
      ]),
    ).toBe(false);
    expect(
      counterIsRunning([
        evento("started", "2026-09-07T09:00:00Z"),
        evento("stopped", "2026-09-07T15:00:00Z"),
      ]),
    ).toBe(false);
  });

  it("manda el último por fecha, no el último de la lista", () => {
    expect(
      counterIsRunning([
        evento("stopped", "2026-09-07T15:00:00Z"),
        evento("started", "2026-09-07T09:00:00Z"),
      ]),
    ).toBe(false);
  });

  it("sin eventos no corre: el reloj no ha arrancado (RN-SLA-01)", () => {
    expect(counterIsRunning([])).toBe(false);
  });
});

describe("el consumo estimado de una solicitud (RN-CLS-08, RN-CON-01)", () => {
  const bolsas = [
    { category: "small" as const, included: 25, remaining: 17 },
    { category: "photo" as const, included: 24, remaining: 18 },
    { category: "medium" as const, included: 5, remaining: 0 },
    { category: "large" as const, included: 0, remaining: 0 },
  ];

  it("RN-CLS-08 · una solicitud gasta UN cambio de su categoría, y se dice lo que queda", () => {
    expect(consumptionEstimate("small", bolsas)).toEqual({
      kind: "included",
      category: "small",
      included: 25,
      remaining: 17,
    });
  });

  it("RN-COM-12 · lo que el plan no incluye va a presupuesto, no a la bolsa", () => {
    expect(consumptionEstimate("large", bolsas)).toEqual({ kind: "budgeted", category: "large" });
  });

  it("una bolsa incluida y agotada NO es presupuesto: el cliente no podrá aceptar", () => {
    expect(consumptionEstimate("medium", bolsas)).toEqual({
      kind: "exhausted",
      category: "medium",
      included: 5,
    });
  });

  it("CA-20 · sin bolsa leída no se supone ninguna de las otras tres", () => {
    expect(consumptionEstimate("small", [])).toEqual({ kind: "unknown", category: "small" });
  });
});

describe("por qué está parado el reloj de primera atención (RN-SLA-03)", () => {
  it("las tres paradas de RN-SLA-03 tienen causa propia", () => {
    expect(t1StopCause("pending_client_acceptance")).toBe("waiting_client");
    expect(t1StopCause("needs_information")).toBe("waiting_information");
    expect(t1StopCause("rejected")).toBe("rejected");
  });

  it("una solicitud ya aceptada o publicada dejó atrás este tramo", () => {
    expect(t1StopCause("accepted")).toBe("closed");
    expect(t1StopCause("published")).toBe("closed");
    expect(t1StopCause("cancelled_after_start")).toBe("closed");
  });

  it("mientras T1 corre, el estado no explica ninguna parada", () => {
    expect(t1StopCause("received")).toBeNull();
    expect(t1StopCause("analyzing")).toBeNull();
    expect(t1StopCause("pending_internal_validation")).toBeNull();
    expect(t1StopCause("draft")).toBeNull();
  });
});
