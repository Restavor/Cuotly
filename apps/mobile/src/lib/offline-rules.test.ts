import { canRunOffline, gateAction, OFFLINE_ACTIONS, SERVER_ONLY_ACTIONS } from "./offline-rules";

describe("RN-MOV-09 · sin conexión se consulta y se redacta; lo crítico exige servidor", () => {
  it("solo los borradores y la lectura de lo reciente pueden hacerse sin conexión", () => {
    for (const action of OFFLINE_ACTIONS) expect(canRunOffline(action)).toBe(true);
    for (const action of SERVER_ONLY_ACTIONS) expect(canRunOffline(action)).toBe(false);
  });

  it("pagar, aceptar, consumir, publicar y completar están en la lista de servidor", () => {
    expect(SERVER_ONLY_ACTIONS).toEqual(
      expect.arrayContaining(["register_payment", "accept_request", "request_menu_publication", "publish_job", "complete_task", "accept_quote"]),
    );
  });

  it("sin conexión, una acción crítica se deshabilita con motivo y no hay un tercer valor que la encole", () => {
    expect(gateAction("publish_job", false)).toEqual({ enabled: false, reason: "offline" });
    expect(gateAction("publish_job", true)).toEqual({ enabled: true });
    expect(gateAction("draft_request", false)).toEqual({ enabled: true });
  });
});
