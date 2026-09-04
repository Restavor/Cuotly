import { describe, expect, it } from "vitest";

import {
  DRAFT_REVIEW_POINTS,
  canSubmitDraft,
  draftScopeChanged,
  isDraft,
  normalizeScopeField,
} from "./request-draft";

describe("request-draft — RN-MSG-10, §68", () => {
  describe("§68 · RN-MSG-10: antes de enviar se revisa alcance, destinatario y archivos", () => {
    it("los tres puntos de revisión son exactamente los del documento, en su orden", () => {
      expect(DRAFT_REVIEW_POINTS).toEqual(["scope", "recipient", "files"]);
    });
  });

  describe("RN-MSG-10 · convertir crea un borrador, y solo el borrador se revisa", () => {
    it("una solicitud en borrador se revisa", () => {
      expect(isDraft("draft")).toBe(true);
    });

    it("una solicitud ya enviada no vuelve a ser un borrador (RN-SLA-08: cambiar el alcance después es otra operación)", () => {
      expect(isDraft("received")).toBe(false);
      expect(isDraft("pending_client_acceptance")).toBe(false);
      expect(isDraft("closed")).toBe(false);
    });
  });

  describe("RN-MSG-10 · qué impide enviar el borrador, y por qué", () => {
    it("un borrador con alcance se puede enviar", () => {
      expect(canSubmitDraft({ state: "draft", description: "Cambiar la foto de portada" })).toEqual({
        ok: true,
        value: undefined,
      });
    });

    it("un borrador sin alcance no se envía, y el motivo se dice (CA-20)", () => {
      expect(canSubmitDraft({ state: "draft", description: "   " })).toEqual({
        ok: false,
        error: "empty_scope",
      });
    });

    it("lo que ya se envió no se vuelve a enviar", () => {
      expect(canSubmitDraft({ state: "received", description: "Cambiar la foto" })).toEqual({
        ok: false,
        error: "not_a_draft",
      });
    });
  });

  describe("RN-DAT-07 · una versión nueva es un cambio real, no un guardado", () => {
    const original = { description: "Cambiar la foto de portada", context: "Inicio" };

    it("reescribir el alcance es un cambio", () => {
      expect(
        draftScopeChanged(original, {
          description: "Cambiar la foto de portada, en horizontal",
          context: "Inicio",
        }),
      ).toBe(true);
    });

    it("cambiar solo el contexto también lo es", () => {
      expect(draftScopeChanged(original, { description: original.description, context: "Carta" })).toBe(
        true,
      );
    });

    it("guardar lo mismo no lo es", () => {
      expect(draftScopeChanged(original, { ...original })).toBe(false);
    });

    it("los espacios de más no son un cambio: el servidor los recorta igual", () => {
      expect(
        draftScopeChanged(original, {
          description: "  Cambiar la foto de portada  ",
          context: " Inicio ",
        }),
      ).toBe(false);
    });

    it("quitar el contexto sí lo es, y dejarlo en blanco es quitarlo", () => {
      expect(draftScopeChanged(original, { description: original.description, context: "  " })).toBe(true);
      expect(normalizeScopeField("  ")).toBeNull();
      expect(normalizeScopeField(null)).toBeNull();
      expect(normalizeScopeField(" Inicio ")).toBe("Inicio");
    });
  });
});
