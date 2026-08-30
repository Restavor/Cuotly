import { describe, expect, it } from "vitest";
import {
  compareCandidates,
  decideAssignment,
  isEligibleCandidate,
  rankCandidates,
  type CandidateWorker,
} from "./assignment";

/** Un candidato válido "de base" que cada test estropea solo en lo que quiere probar. */
function candidate(overrides: Partial<CandidateWorker> = {}): CandidateWorker {
  return {
    workerId: "w-1",
    canPerformJobs: true,
    isSpaceOwner: false,
    assignedToEstablishment: true,
    memberStatus: "active",
    specialties: ["web"],
    availabilityDeclared: true,
    activeLoadPoints: 0,
    activeJobCount: 0,
    deadlinesSoonCount: 0,
    lastAssignedAt: null,
    ...overrides,
  };
}

describe("assignment — RN-ASG-01 a 06, HU-16", () => {
  describe("RN-ASG-06: filtros duros (excluyen)", () => {
    it("RN-ASG-02: solo participan los trabajadores activos y válidos", () => {
      expect(isEligibleCandidate(candidate(), "web")).toBe(true);
      expect(isEligibleCandidate(candidate({ memberStatus: "inactive" }), "web")).toBe(false);
      expect(isEligibleCandidate(candidate({ memberStatus: "access_revoked" }), "web")).toBe(false);
      expect(isEligibleCandidate(candidate({ memberStatus: "invited" }), "web")).toBe(false);
    });

    it("RN-ASG-12: una ausencia aprobada (temporarily_absent) deja fuera al trabajador", () => {
      expect(isEligibleCandidate(candidate({ memberStatus: "temporarily_absent" }), "web")).toBe(false);
    });

    it("sin capacidad de realizar trabajos queda fuera (§4.2, perform_jobs)", () => {
      expect(isEligibleCandidate(candidate({ canPerformJobs: false }), "web")).toBe(false);
    });

    it("RN-ASG-01: si no está asignado a ese establecimiento, queda fuera", () => {
      expect(isEligibleCandidate(candidate({ assignedToEstablishment: false }), "web")).toBe(false);
    });

    it("la especialidad debe ser compatible", () => {
      expect(isEligibleCandidate(candidate({ specialties: ["seo"] }), "web")).toBe(false);
    });

    it("§4.6 / RN-ASG-01: `general` habilita cualquier categoría", () => {
      expect(isEligibleCandidate(candidate({ specialties: ["general"] }), "daily_menu")).toBe(true);
      expect(isEligibleCandidate(candidate({ specialties: ["general", "seo"] }), "design")).toBe(true);
    });

    it("RN-ASG-10/11: sin disponibilidad declarada, queda fuera de la recomendación", () => {
      expect(isEligibleCandidate(candidate({ availabilityDeclared: false }), "web")).toBe(false);
    });
  });

  describe("RN-ASG-06: desempate, en este orden", () => {
    it("1.º menor carga actual en puntos", () => {
      const ligero = candidate({ workerId: "a", activeLoadPoints: 3, activeJobCount: 9 });
      const cargado = candidate({ workerId: "b", activeLoadPoints: 12, activeJobCount: 1 });
      expect(compareCandidates(ligero, cargado)).toBeLessThan(0);
    });

    it("2.º a igual carga, menor número de trabajos activos", () => {
      const pocos = candidate({ workerId: "a", activeLoadPoints: 6, activeJobCount: 1, deadlinesSoonCount: 3 });
      const muchos = candidate({ workerId: "b", activeLoadPoints: 6, activeJobCount: 4, deadlinesSoonCount: 0 });
      expect(compareCandidates(pocos, muchos)).toBeLessThan(0);
    });

    it("3.º a igual carga y trabajos, menos plazos próximos a vencer", () => {
      const tranquilo = candidate({ workerId: "a", deadlinesSoonCount: 0, lastAssignedAt: new Date("2026-08-30T10:00:00Z") });
      const apurado = candidate({ workerId: "b", deadlinesSoonCount: 2, lastAssignedAt: new Date("2026-01-01T10:00:00Z") });
      expect(compareCandidates(tranquilo, apurado)).toBeLessThan(0);
    });

    it("4.º a igualdad de todo lo anterior, mayor tiempo desde su última asignación", () => {
      const antiguo = candidate({ workerId: "a", lastAssignedAt: new Date("2026-01-01T10:00:00Z") });
      const reciente = candidate({ workerId: "b", lastAssignedAt: new Date("2026-08-29T10:00:00Z") });
      expect(compareCandidates(antiguo, reciente)).toBeLessThan(0);
    });

    it("quien nunca ha recibido una asignación va antes que quien ya recibió alguna", () => {
      const nunca = candidate({ workerId: "z", lastAssignedAt: null });
      const alguna = candidate({ workerId: "a", lastAssignedAt: new Date("2020-01-01T10:00:00Z") });
      expect(compareCandidates(nunca, alguna)).toBeLessThan(0);
    });

    it("el orden es determinista: dos candidatos idénticos siempre se ordenan igual", () => {
      const a = candidate({ workerId: "aaa" });
      const b = candidate({ workerId: "bbb" });
      expect(compareCandidates(a, b)).toBeLessThan(0);
      expect(compareCandidates(b, a)).toBeGreaterThan(0);
      expect(rankCandidates([b, a], "web").map((c) => c.workerId)).toEqual(["aaa", "bbb"]);
      expect(rankCandidates([a, b], "web").map((c) => c.workerId)).toEqual(["aaa", "bbb"]);
    });
  });

  describe("HU-16: asignación automática con candidato único, recomendación con varios", () => {
    it("RN-ASG-03: con exactamente un candidato válido, Cuotly lo asigna automáticamente", () => {
      const candidates = [
        candidate({ workerId: "valido" }),
        candidate({ workerId: "inactivo", memberStatus: "inactive" }),
        candidate({ workerId: "otra-especialidad", specialties: ["seo"] }),
      ];

      expect(decideAssignment(candidates, "web")).toMatchObject({ outcome: "auto_assign", workerId: "valido" });
    });

    it("RN-ASG-04: con varios válidos, recomienda uno y no asigna nada", () => {
      const candidates = [
        candidate({ workerId: "cargado", activeLoadPoints: 20 }),
        candidate({ workerId: "libre", activeLoadPoints: 2 }),
      ];

      const decision = decideAssignment(candidates, "web");

      expect(decision.outcome).toBe("recommendation");
      if (decision.outcome !== "recommendation") throw new Error("decisión inesperada");
      expect(decision.recommendedWorkerId).toBe("libre");
      // La recomendación ofrece la lista completa: el propietario acepta o elige otro.
      expect(decision.ranked.map((c) => c.workerId)).toEqual(["libre", "cargado"]);
    });

    it("§4.2 / RN-ASG-05: el propietario del espacio no entra en la recomendación, ni siquiera siendo el único posible", () => {
      const soloElPropietario = [candidate({ workerId: "bosco", isSpaceOwner: true })];

      // "Puede ejecutar trabajos solo como recurso operativo cuando no hay
      // nadie más disponible": el trabajo queda pendiente y se avisa
      // (RN-ASG-05); asumirlo es una decisión suya, no una asignación
      // automática.
      expect(decideAssignment(soloElPropietario, "web")).toEqual({ outcome: "pending_assignment", ranked: [] });
    });

    it("§4.2: con un trabajador válido y el propietario, el único candidato es el trabajador", () => {
      const candidates = [
        candidate({ workerId: "bosco", isSpaceOwner: true, activeLoadPoints: 0 }),
        candidate({ workerId: "ana", activeLoadPoints: 12 }),
      ];

      expect(decideAssignment(candidates, "web")).toMatchObject({ outcome: "auto_assign", workerId: "ana" });
    });

    it("RN-ASG-05: sin ningún candidato válido, el trabajo queda pendiente de asignación", () => {
      const candidates = [
        candidate({ workerId: "ausente", memberStatus: "temporarily_absent" }),
        candidate({ workerId: "no-disponible", availabilityDeclared: false }),
      ];

      expect(decideAssignment(candidates, "web")).toEqual({ outcome: "pending_assignment", ranked: [] });
    });

    it("RN-ASG-06: la recomendación no inventa pesos — es el primero del orden lexicográfico", () => {
      const candidates = [
        candidate({ workerId: "a", activeLoadPoints: 4, activeJobCount: 1 }),
        candidate({ workerId: "b", activeLoadPoints: 4, activeJobCount: 3 }),
        candidate({ workerId: "c", activeLoadPoints: 4, activeJobCount: 1, deadlinesSoonCount: 5 }),
      ];

      const decision = decideAssignment(candidates, "web");
      if (decision.outcome !== "recommendation") throw new Error("decisión inesperada");
      expect(decision.recommendedWorkerId).toBe("a");
      expect(decision.ranked.map((c) => c.workerId)).toEqual(["a", "c", "b"]);
    });
  });
});
