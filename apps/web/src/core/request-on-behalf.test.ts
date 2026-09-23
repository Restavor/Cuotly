import { describe, expect, it } from "vitest";

import {
  ON_BEHALF_REASON_MAX,
  PRIORITY_REASON_MAX,
  REQUEST_PRIORITIES,
  canCreateOnBehalf,
  checkOnBehalfRequest,
  needsAiClassification,
  type OnBehalfInput,
} from "./request-on-behalf";

const completa: OnBehalfInput = {
  establishmentId: "est-1",
  description: "Actualizar el horario en la web y en Google.",
  priority: "high",
  priorityReason: "Abrimos los lunes desde el 1 de octubre.",
  onBehalfReason: "Lo pidió la propietaria por teléfono el 23/09.",
  category: "",
};

describe("request-on-behalf — RN-REQ-08, decisión 73", () => {
  describe("RN-REQ-08 · quién puede crear en nombre del restaurante", () => {
    it("el propietario y los administradores del espacio, sí", () => {
      expect(canCreateOnBehalf("owner")).toBe(true);
      expect(canCreateOnBehalf("admin")).toBe(true);
    });

    it("un trabajador y el propio restaurante, no", () => {
      for (const role of ["worker", "client", "client_daily_menu", ""]) {
        expect(canCreateOnBehalf(role)).toBe(false);
      }
    });
  });

  describe("RN-REQ-08 · lo que no puede faltar", () => {
    it("completa, sale con los campos limpios y sin categoría", () => {
      const r = checkOnBehalfRequest({ ...completa, description: "  Algo  " });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.description).toBe("Algo");
        expect(r.value.category).toBeNull();
      }
    });

    it("sin restaurante, se dice que falta el restaurante", () => {
      expect(checkOnBehalfRequest({ ...completa, establishmentId: " " })).toEqual({
        ok: false,
        error: "establishment_required",
      });
    });

    it("sin descripción, no", () => {
      expect(checkOnBehalfRequest({ ...completa, description: "   " })).toEqual({
        ok: false,
        error: "description_required",
      });
    });

    it("RN-REQ-05 · la prioridad es una de las tres y lleva motivo de hasta 200", () => {
      expect(REQUEST_PRIORITIES).toEqual(["high", "medium", "low"]);
      expect(checkOnBehalfRequest({ ...completa, priority: "" })).toMatchObject({ error: "priority_required" });
      expect(checkOnBehalfRequest({ ...completa, priority: "urgent" })).toMatchObject({ error: "priority_required" });
      expect(checkOnBehalfRequest({ ...completa, priorityReason: " " })).toMatchObject({
        error: "priority_reason_required",
      });
      expect(
        checkOnBehalfRequest({ ...completa, priorityReason: "x".repeat(PRIORITY_REASON_MAX + 1) }),
      ).toMatchObject({ error: "priority_reason_too_long" });
      expect(checkOnBehalfRequest({ ...completa, priorityReason: "x".repeat(PRIORITY_REASON_MAX) }).ok).toBe(true);
    });

    it("RN-REQ-08 · cómo lo pidió el restaurante es obligatorio y cabe en 500", () => {
      expect(checkOnBehalfRequest({ ...completa, onBehalfReason: "  " })).toMatchObject({
        error: "on_behalf_reason_required",
      });
      expect(
        checkOnBehalfRequest({ ...completa, onBehalfReason: "x".repeat(ON_BEHALF_REASON_MAX + 1) }),
      ).toMatchObject({ error: "on_behalf_reason_too_long" });
      expect(checkOnBehalfRequest({ ...completa, onBehalfReason: "x".repeat(ON_BEHALF_REASON_MAX) }).ok).toBe(true);
    });
  });

  describe("RN-REQ-08 · la categoría del equipo sustituye a la IA", () => {
    it("con categoría, la propuesta es del equipo y no se llama a la IA", () => {
      const r = checkOnBehalfRequest({ ...completa, category: "small" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.category).toBe("small");
        expect(needsAiClassification(r.value)).toBe(false);
      }
    });

    it("sin categoría, la clasifica la IA como a cualquier otra", () => {
      const r = checkOnBehalfRequest(completa);
      expect(r.ok && needsAiClassification(r.value)).toBe(true);
    });

    it("una categoría que no existe no pasa", () => {
      expect(checkOnBehalfRequest({ ...completa, category: "huge" })).toMatchObject({
        error: "category_invalid",
      });
    });
  });
});
