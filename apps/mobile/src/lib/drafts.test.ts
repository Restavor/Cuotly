import { newMessageDraft, newRequestDraft, sendRequestDraft, type RequestDraft } from "./drafts";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}), getAllKeys: jest.fn(async () => []) },
}));

describe("RN-MOV-10 · la clave de idempotencia nace con el borrador", () => {
  it("un borrador de mensaje y uno de solicitud nacen con clave y sin id de servidor", () => {
    const message = newMessageDraft({ spaceSlug: "demo", conversationId: "c1", body: "hola" });
    const request = newRequestDraft({ spaceSlug: "demo", establishmentId: "e1", description: "cambiar la carta", context: "" });
    expect(message.idempotencyKey).toMatch(/^message:/);
    expect(request.idempotencyKey).toMatch(/^request:/);
    expect(request.serverRequestId).toBeNull();
    expect(newMessageDraft({ spaceSlug: "demo", conversationId: "c1", body: "hola" }).idempotencyKey).not.toBe(message.idempotencyKey);
  });

  it("enviar una solicitud guarda el id del servidor entre crear y enviar, y un reintento no vuelve a crear", async () => {
    const draft = newRequestDraft({ spaceSlug: "demo", establishmentId: "e1", description: "cambiar la carta", context: "" });
    const create = jest.fn(async () => "req-1");
    const submit = jest.fn(async () => {
      throw new Error("se cortó la conexión");
    });
    const persisted: RequestDraft[] = [];
    const persist = jest.fn(async (d: RequestDraft) => {
      persisted.push(d);
    });

    await expect(sendRequestDraft(draft, { create, submit, persist })).rejects.toThrow("se cortó");
    expect(create).toHaveBeenCalledTimes(1);
    expect(persisted[0]?.serverRequestId).toBe("req-1");

    // El reintento parte del borrador guardado: no crea una segunda solicitud.
    const submitOk = jest.fn(async () => {});
    const id = await sendRequestDraft(persisted[0], { create, submit: submitOk, persist });
    expect(id).toBe("req-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(submitOk).toHaveBeenCalledWith("req-1");
  });
});

describe("RN-REQ-09 · el borrador del teléfono sabe si es un cambio o una incidencia", () => {
  it("RN-REQ-09 · por omisión es un cambio, y guarda la incidencia si se elige", () => {
    expect(newRequestDraft({ spaceSlug: "demo", establishmentId: "e1", description: "x", context: "" }).requestKind).toBe("change");
    expect(
      newRequestDraft({ spaceSlug: "demo", establishmentId: "e1", description: "La web no carga", context: "", requestKind: "incident" })
        .requestKind,
    ).toBe("incident");
  });
});
