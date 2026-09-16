import { fromError, isAlreadyDone } from "./api";

describe("RN-MOV-10 · un «ya hecho» del servidor no es un error de red", () => {
  it("reconoce los mensajes de estado del servidor", () => {
    expect(isAlreadyDone("La solicitud ya se envió")).toBe(true);
    expect(isAlreadyDone("Este trabajo ya está publicado")).toBe(true);
    expect(isAlreadyDone("No tienes permiso para editar este menú")).toBe(false);
  });

  it("un error del servidor viaja con su mensaje, en español, tal cual", () => {
    expect(fromError(null)).toEqual({ ok: true });
    expect(fromError(new Error("Solo el propietario o un administrador pueden decidir una ausencia"))).toEqual({
      ok: false,
      error: "Solo el propietario o un administrador pueden decidir una ausencia",
    });
  });
});
