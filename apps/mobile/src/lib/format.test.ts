import { linesToItems, parseEurosToCents } from "./format";

describe("el precio y las líneas de un menú, como en la web", () => {
  it("acepta coma o punto y rechaza lo que no es un importe", () => {
    expect(parseEurosToCents("14,50")).toBe(1450);
    expect(parseEurosToCents("14.5")).toBe(1450);
    expect(parseEurosToCents(" 9 € ")).toBe(900);
    expect(parseEurosToCents("abc")).toBeNull();
    expect(parseEurosToCents("1,234")).toBeNull();
  });

  it("una línea por plato, sin vacíos", () => {
    expect(linesToItems("Ensalada\n\n  Sopa  \n")).toEqual(["Ensalada", "Sopa"]);
  });
});
