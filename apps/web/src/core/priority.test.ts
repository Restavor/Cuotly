import { describe, expect, it } from "vitest";

import { moveInOrder } from "./priority";

describe("mover un cambio dentro del orden del restaurante", () => {
  const lista = ["a", "b", "c"];

  it("sube y baja intercambiando con el vecino", () => {
    expect(moveInOrder(lista, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(lista, 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("el primero no sube y el último no baja", () => {
    // `null` y no "la lista igual": devolver la lista haría que quien
    // llama la mandara al servidor y quedara un apunte de auditoría de un
    // cambio que no cambió nada.
    expect(moveInOrder(lista, 0, -1)).toBeNull();
    expect(moveInOrder(lista, 2, 1)).toBeNull();
  });

  it("una posición que no existe no mueve nada", () => {
    expect(moveInOrder(lista, 7, -1)).toBeNull();
    expect(moveInOrder(lista, -1, 1)).toBeNull();
    expect(moveInOrder(lista, 1.5, 1)).toBeNull();
    expect(moveInOrder([], 0, 1)).toBeNull();
  });

  it("no toca la lista que recibe", () => {
    const original = ["a", "b", "c"];
    moveInOrder(original, 0, 1);
    expect(original).toEqual(["a", "b", "c"]);
  });
});
