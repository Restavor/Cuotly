import { describe, expect, it } from "vitest";
import {
  JOB_LOAD_POINTS,
  TASK_LOAD_POINTS,
  calculateActiveLoadPoints,
  distributeTaskPoints,
  loadLevel,
  shouldWarnAboutLoad,
  taskWeightForMinutes,
} from "./load-points";

describe("load-points — RN-ASG-13 a 17, §14.4, HU-21", () => {
  it("§14.4: los puntos por trabajo son Fotográfico 1, Pequeño 1, Mediano 4, Grande 10", () => {
    expect(JOB_LOAD_POINTS).toEqual({ photo: 1, small: 1, medium: 4, large: 10 });
  });

  it("§14.4: los puntos por tarea son Ligera 1, Normal 3, Alta 6, Muy alta 10", () => {
    expect(TASK_LOAD_POINTS).toEqual({ light: 1, normal: 3, high: 6, very_high: 10 });
  });

  describe("§14.4: duración de una tarea -> categoría de puntos", () => {
    it("hasta 15 min es Ligera", () => {
      expect(taskWeightForMinutes(5)).toBe("light");
      expect(taskWeightForMinutes(15)).toBe("light");
    });

    it("15–45 min es Normal", () => {
      expect(taskWeightForMinutes(16)).toBe("normal");
      expect(taskWeightForMinutes(45)).toBe("normal");
    });

    it("45–120 min es Alta", () => {
      expect(taskWeightForMinutes(46)).toBe("high");
      expect(taskWeightForMinutes(120)).toBe("high");
    });

    it("2–4 h es Muy alta", () => {
      expect(taskWeightForMinutes(121)).toBe("very_high");
      expect(taskWeightForMinutes(240)).toBe("very_high");
    });

    it("RN-ASG-16: más de 4 h no tiene categoría — la tarea debe dividirse, no se inventa una nueva", () => {
      expect(taskWeightForMinutes(241)).toBe("must_be_split");
      expect(taskWeightForMinutes(60 * 8)).toBe("must_be_split");
    });
  });

  describe("§14.4: niveles de carga", () => {
    it("0–9 Baja · 10–19 Normal · 20–29 Alta · 30 o más Muy alta", () => {
      expect(loadLevel(0)).toBe("low");
      expect(loadLevel(9)).toBe("low");
      expect(loadLevel(10)).toBe("normal");
      expect(loadLevel(19)).toBe("normal");
      expect(loadLevel(20)).toBe("high");
      expect(loadLevel(29)).toBe("high");
      expect(loadLevel(30)).toBe("very_high");
      expect(loadLevel(120)).toBe("very_high");
    });

    it("RN-ASG-15: no hay máximo duro — el nivel muy alto solo avisa", () => {
      expect(shouldWarnAboutLoad(29)).toBe(false);
      expect(shouldWarnAboutLoad(30)).toBe(true);
      // Nada en este módulo impide asignar por encima del nivel: la función
      // devuelve un aviso, no un veto.
      expect(typeof shouldWarnAboutLoad(200)).toBe("boolean");
    });
  });

  describe("RN-ASG-13/14 · HU-21: qué suma y qué deja de sumar", () => {
    it("RN-ASG-13: suman los trabajos activos del responsable y sus tareas asignadas", () => {
      const points = calculateActiveLoadPoints(
        [
          { jobId: "j1", category: "medium", isBrokenIntoTasks: false },
          { jobId: "j2", category: "small", isBrokenIntoTasks: false },
        ],
        [{ taskId: "t1", weight: "normal" }],
      );
      expect(points).toBe(4 + 1 + 3);
    });

    it("RN-ASG-14: un trabajo NO desglosado da los puntos completos del cambio al responsable", () => {
      expect(calculateActiveLoadPoints([{ jobId: "j1", category: "large", isBrokenIntoTasks: false }], [])).toBe(10);
    });

    it("RN-ASG-14: al desglosarlo, los puntos generales del trabajo dejan de sumar", () => {
      const points = calculateActiveLoadPoints(
        [{ jobId: "j1", category: "large", isBrokenIntoTasks: true }],
        [{ taskId: "t1", weight: "high" }],
      );
      // 6 de la tarea, no 10 del trabajo ni 16 sumando ambos.
      expect(points).toBe(6);
    });

    it("RN-ASG-13: lo completado deja de sumar (quien llama solo pasa lo activo)", () => {
      expect(calculateActiveLoadPoints([], [])).toBe(0);
    });

    it("HU-21: cada participante recibe los puntos de sus tareas", () => {
      const reparto = distributeTaskPoints([
        { taskId: "t1", weight: "high", assigneeId: "ana" },
        { taskId: "t2", weight: "light", assigneeId: "ana" },
        { taskId: "t3", weight: "very_high", assigneeId: "luis" },
      ]);

      expect(reparto.get("ana")).toBe(7);
      expect(reparto.get("luis")).toBe(10);
      expect(reparto.size).toBe(2);
    });
  });
});
