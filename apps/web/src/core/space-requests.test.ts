import { describe, expect, it } from "vitest";

import {
  CUOTLY_PLANS,
  SPACE_REQUEST_ACTORS,
  SPACE_REQUEST_STATES,
  type SpaceRequestState,
  isCuotlyPlan,
  isSpaceRequestFinal,
  isSpaceRequestState,
  isVisibleToPlatform,
  spaceRequestNeedsReason,
  spaceRequestTransitionAllowed,
} from "./space-requests";

/**
 * La solicitud de creación de espacio (PRD §30, RN-PLA; §10 y §167). Lo que
 * se vigila aquí es la tabla de estados, que es lo único de este hito que
 * es dominio puro: lo demás —quién aprueba, qué pasa al aprobar— lo
 * comprueba `supabase/tests/plataforma_solicitud_de_espacio.sql` contra la
 * base, porque es donde tiene que ser verdad.
 */
describe("los seis estados de una solicitud de espacio (RN-PLA-01)", () => {
  it("RN-PLA-01 · son los seis de §10 y ni uno más", () => {
    expect([...SPACE_REQUEST_STATES]).toEqual([
      "draft",
      "submitted",
      "in_review",
      "needs_information",
      "approved",
      "rejected",
    ]);
  });

  it("RN-PLA-01 · un estado inventado no pasa la guarda", () => {
    expect(isSpaceRequestState("draft")).toBe(true);
    expect(isSpaceRequestState("cancelled")).toBe(false);
  });

  it("RN-PLA-01 · los planes que se pueden pedir son los dos de §4", () => {
    expect([...CUOTLY_PLANS]).toEqual(["pro", "agency"]);
    expect(isCuotlyPlan("agency")).toBe(true);
    // "basico", "impulso" y "premium" son los planes que un espacio le vende
    // a sus restaurantes (§5). Aquí se pide otro producto y son otros dos.
    expect(isCuotlyPlan("premium")).toBe(false);
  });
});

describe("quién mueve cada transición (RN-PLA-03)", () => {
  it("RN-PLA-03 · el solicitante envía su borrador, y la plataforma no lo toca", () => {
    expect(spaceRequestTransitionAllowed("draft", "submitted", "requester")).toBe(true);
    // Lo que nadie ha visto no se puede rechazar (RN-PLA-02).
    for (const destino of SPACE_REQUEST_STATES) {
      expect(
        spaceRequestTransitionAllowed("draft", destino, "platform"),
        `la plataforma mueve un borrador a ${destino}`,
      ).toBe(false);
    }
  });

  it("RN-PLA-03 · decidir es de la plataforma, y el solicitante no decide sobre lo suyo", () => {
    for (const destino of ["in_review", "needs_information", "approved", "rejected"] as const) {
      expect(spaceRequestTransitionAllowed("submitted", destino, "platform")).toBe(true);
      expect(
        spaceRequestTransitionAllowed("submitted", destino, "requester"),
        `el solicitante se aprueba a sí mismo pasando a ${destino}`,
      ).toBe(false);
    }
  });

  it("RN-PLA-03 · se puede aprobar sin pasar por 'En revisión': §10 da los estados, no un trámite", () => {
    expect(spaceRequestTransitionAllowed("submitted", "approved", "platform")).toBe(true);
    expect(spaceRequestTransitionAllowed("in_review", "approved", "platform")).toBe(true);
  });

  it("RN-PLA-03 · 'Necesita información' devuelve la pelota al solicitante, y solo a él", () => {
    expect(spaceRequestTransitionAllowed("needs_information", "submitted", "requester")).toBe(true);
    expect(spaceRequestTransitionAllowed("needs_information", "submitted", "platform")).toBe(false);
  });

  it("RN-PLA-03 · de 'Aprobada' y 'Rechazada' no se sale por ningún lado", () => {
    for (const final of ["approved", "rejected"] as const) {
      expect(isSpaceRequestFinal(final)).toBe(true);
      for (const destino of SPACE_REQUEST_STATES) {
        for (const actor of SPACE_REQUEST_ACTORS) {
          expect(
            spaceRequestTransitionAllowed(final, destino, actor),
            `${final} -> ${destino} como ${actor}`,
          ).toBe(false);
        }
      }
    }
  });

  it("RN-PLA-03 · ningún estado se mueve a sí mismo", () => {
    for (const estado of SPACE_REQUEST_STATES) {
      for (const actor of SPACE_REQUEST_ACTORS) {
        expect(spaceRequestTransitionAllowed(estado, estado, actor), `${estado} -> ${estado}`).toBe(false);
      }
    }
  });

  /**
   * En falso-cerrado: si alguien añade un estado a la lista y se olvida de
   * ponerlo en la tabla, esto falla. Sin él, un estado nuevo quedaría
   * inalcanzable y en silencio — que es peor que un error, porque parece
   * que funciona.
   */
  it("RN-PLA-03 · todo estado de la lista está en la tabla, de ida y de vuelta", () => {
    for (const from of SPACE_REQUEST_STATES) {
      for (const to of SPACE_REQUEST_STATES) {
        for (const actor of SPACE_REQUEST_ACTORS) {
          expect(
            typeof spaceRequestTransitionAllowed(from, to, actor),
            `${from} -> ${to} como ${actor} no está en la tabla`,
          ).toBe("boolean");
        }
      }
    }
  });

  it("RN-PLA-03 · todo estado salvo el borrador se alcanza desde algún sitio", () => {
    const alcanzables = new Set<SpaceRequestState>();
    for (const from of SPACE_REQUEST_STATES) {
      for (const to of SPACE_REQUEST_STATES) {
        for (const actor of SPACE_REQUEST_ACTORS) {
          if (spaceRequestTransitionAllowed(from, to, actor)) alcanzables.add(to);
        }
      }
    }
    // `draft` es donde nace, así que no se llega a él: se empieza ahí.
    expect([...alcanzables].sort()).toEqual(
      ["approved", "in_review", "needs_information", "rejected", "submitted"].sort(),
    );
  });
});

describe("el motivo y lo que ve cada lado (RN-PLA-06, RN-PLA-02)", () => {
  it("RN-PLA-06 · rechazar y pedir información exigen motivo; aprobar no", () => {
    expect(spaceRequestNeedsReason("rejected")).toBe(true);
    expect(spaceRequestNeedsReason("needs_information")).toBe(true);
    expect(spaceRequestNeedsReason("approved")).toBe(false);
    expect(spaceRequestNeedsReason("in_review")).toBe(false);
  });

  it("RN-PLA-02 · la plataforma ve todo menos el borrador", () => {
    expect(isVisibleToPlatform("draft")).toBe(false);
    for (const estado of SPACE_REQUEST_STATES.filter((e) => e !== "draft")) {
      expect(isVisibleToPlatform(estado), estado).toBe(true);
    }
  });
});
