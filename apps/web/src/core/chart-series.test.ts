import { describe, expect, it } from "vitest";

import { axisScale, labelledIndexes, linePath, linePoints } from "./chart-series";

describe("la geometría de la gráfica (página 22 del diseño móvil)", () => {
  describe("el eje vertical empieza SIEMPRE en cero", () => {
    it("la primera marca es cero, siempre", () => {
      // La escala no arranca en el mínimo, que es lo que convierte "de 8 a
      // 10" en una subida que parece el doble.
      for (const valores of [[3, 7, 12], [21, 4, 9], [120, 40], [1, 2, 3], [0, 0, 0], []]) {
        expect(axisScale(valores).ticks[0]).toBe(0);
      }
    });

    it("TODAS las marcas son enteras: no existen 6,3 solicitudes", () => {
      // Esto es lo que se veía mal en la gráfica dibujada: un techo
      // "redondo" partido en cuatro daba 6,25 · 12,5 · 18,75.
      for (let mayor = 0; mayor <= 300; mayor += 1) {
        const { ticks } = axisScale([mayor]);
        for (const marca of ticks) {
          expect(Number.isInteger(marca)).toBe(true);
        }
      }
    });

    it("el techo cubre el valor más alto sin pasarse", () => {
      expect(axisScale([3, 7, 12]).max).toBe(15);
      expect(axisScale([21, 4, 9]).max).toBe(25);
      expect(axisScale([24]).max).toBe(25);
      expect(axisScale([120, 40]).max).toBe(150);
      // Y nunca se queda corto, que sería recortar la línea.
      for (let mayor = 1; mayor <= 300; mayor += 1) {
        expect(axisScale([mayor]).max).toBeGreaterThanOrEqual(mayor);
      }
    });

    it("con pocos valores el techo es el mayor, sin inflarlo", () => {
      expect(axisScale([1, 2, 3]).max).toBe(3);
      expect(axisScale([5]).max).toBe(5);
    });

    it("todo a cero da techo 1, porque una caja de alto cero no se dibuja", () => {
      expect(axisScale([0, 0, 0]).max).toBe(1);
      expect(axisScale([]).max).toBe(1);
      expect(axisScale([]).ticks).toEqual([0, 1]);
    });

    it("nunca escribe más de seis marcas, que ya no se leen", () => {
      for (let mayor = 0; mayor <= 300; mayor += 1) {
        expect(axisScale([mayor]).ticks.length).toBeLessThanOrEqual(6);
      }
    });

    it("las marcas van de 0 al techo, con el mismo salto", () => {
      const { max, ticks } = axisScale([20]);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBe(max);
      const salto = ticks[1] - ticks[0];
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i] - ticks[i - 1]).toBe(salto);
      }
    });
  });

  describe("los puntos", () => {
    const caja = { plotWidth: 100, plotHeight: 50, max: 10 };

    it("el valor más alto toca arriba y el cero se apoya en la base", () => {
      const puntos = linePoints([0, 10], caja);
      expect(puntos[0]).toEqual({ x: 0, y: 50 });
      expect(puntos[1]).toEqual({ x: 100, y: 0 });
    });

    it("reparten el ancho por igual", () => {
      const puntos = linePoints([1, 2, 3, 4, 5], caja);
      expect(puntos.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
    });

    it("un solo punto se dibuja en el centro, no pegado al eje", () => {
      expect(linePoints([4], caja)).toEqual([{ x: 50, y: 30 }]);
    });

    it("sin valores no hay línea, y eso no es una línea en cero", () => {
      expect(linePoints([], caja)).toEqual([]);
      expect(linePath([])).toBe("");
    });

    it("la línea empieza con M y sigue con L", () => {
      expect(linePath(linePoints([0, 10], caja))).toBe("M0.00 50.00 L100.00 0.00");
    });
  });

  describe("las etiquetas del eje horizontal", () => {
    it("un mes de 31 días no escribe 31 etiquetas", () => {
      const indices = labelledIndexes(31, 5);
      expect(indices.length).toBeLessThanOrEqual(6);
    });

    it("el primero y el último llevan etiqueta siempre", () => {
      const indices = labelledIndexes(31, 5);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(30);
    });

    it("con pocos días las lleva todas", () => {
      expect(labelledIndexes(4, 5)).toEqual([0, 1, 2, 3]);
    });
  });
});
