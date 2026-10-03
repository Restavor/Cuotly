import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** El cableado de la ruta del webhook de WhatsApp: la verificación de Meta y la puerta de la firma. */
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));

import { signMetaPayload } from "@/services/agents/messaging/webhook-whatsapp";

import { GET, POST } from "./route";

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { outcome: "delivered" }, error: null });
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
});
afterEach(() => {
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
});

const verify = (token: string) =>
  GET(new Request(`http://localhost/api/agents/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=987654`));

describe("AVI-03 · la ruta del webhook de WhatsApp", () => {
  it("AVI-03 · la verificación devuelve el reto como texto con el token correcto, y 403 con otro; sin token configurado, 503", async () => {
    expect((await verify("x")).status).toBe(503);
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "mi-token";
    const ok = await verify("mi-token");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("987654");
    expect(ok.headers.get("content-type")).toContain("text/plain");
    expect((await verify("otro")).status).toBe(403);
  });

  it("AVI-03 · un POST sin secreto de la app, 503; con firma falsa, 400; y no toca la base de datos", async () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const post = (signature: string | null) =>
      POST(new Request("http://localhost/api/agents/webhooks/whatsapp", { method: "POST", body: raw, headers: signature ? { "x-hub-signature-256": signature } : {} }));
    expect((await post(signMetaPayload(raw, "s"))).status).toBe(503);
    process.env.WHATSAPP_APP_SECRET = "secreto-de-la-app";
    expect((await post("sha256=" + "0".repeat(64))).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("AVI-03 · un POST firmado con un estado lo apunta en la base de datos", async () => {
    process.env.WHATSAPP_APP_SECRET = "secreto-de-la-app";
    const raw = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.ABC", status: "delivered", biz_opaque_callback_data: "notice:11111111-1111-4111-8111-111111111111" }] } }] }],
    });
    const r = await POST(
      new Request("http://localhost/api/agents/webhooks/whatsapp", { method: "POST", body: raw, headers: { "x-hub-signature-256": signMetaPayload(raw, "secreto-de-la-app") } }),
    );
    expect(r.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("reservation_notice_provider_event", expect.objectContaining({ p_event: "delivered", p_provider: "meta" }));
  });
});
