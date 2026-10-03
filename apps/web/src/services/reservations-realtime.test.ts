import { afterEach, describe, expect, it, vi } from "vitest";
import { broadcastChange, realtimeChannelFor } from "./reservations-realtime";

const EST = "e5200000-0000-0000-0000-000000000001";
const OTHER = "e5200000-0000-0000-0000-000000000002";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RN-RES-13 · el canal de tiempo real", () => {
  it("RN-RES-13 · el nombre es secreto: sale de la clave del servidor y no se puede deducir del restaurante", () => {
    const a = realtimeChannelFor(EST, "clave-del-servidor");
    expect(a).toMatch(/^reservas-[0-9a-f]{32}$/);
    expect(a).not.toContain(EST);
    expect(realtimeChannelFor(EST, "clave-del-servidor")).toBe(a);
    expect(realtimeChannelFor(OTHER, "clave-del-servidor")).not.toBe(a);
    expect(realtimeChannelFor(EST, "otra-clave")).not.toBe(a);
  });
  it("RN-RES-13 · sin clave del servidor no hay canal: es la versión falsa en local", async () => {
    expect(realtimeChannelFor(EST, "")).toBeNull();
    vi.stubEnv("RESERVATIONS_BROADCAST_SECRET", "");
    const fetchSpy = vi.fn();
    const out = await broadcastChange(EST, { kind: "agent" }, fetchSpy as unknown as typeof fetch);
    expect(out).toEqual({ sent: false, reason: "no_channel" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("RN-RES-13 · emite al canal del restaurante solo con la fecha y el motivo", async () => {
    vi.stubEnv("RESERVATIONS_BROADCAST_SECRET", "clave-del-servidor");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const calls: { url: string; body: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    const out = await broadcastChange(EST, { kind: "date", date: "2026-09-26", reason: "new" }, fake);
    expect(out).toEqual({ sent: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://x.supabase.co/realtime/v1/api/broadcast");
    const sent = JSON.parse(calls[0].body);
    expect(sent.messages[0].topic).toBe(realtimeChannelFor(EST, "clave-del-servidor"));
    expect(sent.messages[0].payload).toEqual({ kind: "date", date: "2026-09-26", reason: "new" });
    expect(calls[0].body).not.toContain(EST);
  });
  it("RN-RES-13 · un fallo al emitir no rompe la operación", async () => {
    vi.stubEnv("RESERVATIONS_BROADCAST_SECRET", "clave-del-servidor");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const boom = (async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch;
    expect(await broadcastChange(EST, { kind: "agent" }, boom)).toEqual({ sent: false, reason: "failed" });
    const bad = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await broadcastChange(EST, { kind: "agent" }, bad)).toEqual({ sent: false, reason: "failed" });
  });
});
