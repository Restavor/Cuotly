import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { decodeDeviceAuthFailure } from "@/core/reservations/device";
import type { Database } from "@/lib/supabase/database.types";

import { createDeviceClient, type DeviceCaller } from "./device-client";

type Call = { readonly name: string; readonly args: Record<string, unknown> };

/** Un «Supabase» de mentira que apunta lo que le piden y contesta lo que se le diga. */
function fakeAdmin(replies: Record<string, unknown>) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => ({ table }));
  const admin = {
    from,
    storage: { id: "almacenamiento" },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const reply = replies[name];
      if (reply instanceof Error) return { data: null, error: { message: reply.message, code: "XX000" } };
      return { data: reply ?? null, error: null };
    }),
  };
  return { admin: admin as unknown as SupabaseClient<Database>, calls, from };
}

const CALLER: DeviceCaller = { tokenHash: "a".repeat(64), establishmentId: "est-A", pinHmac: "b".repeat(64), staffId: null };

describe("RN-APP-08 · el cliente de la tablet", () => {
  it("RN-APP-08 · una escritura entra por la puerta de la tablet con su operación, el token y el PIN, sin el restaurante de quien llama", async () => {
    const { admin, calls } = fakeAdmin({ reservation_device_act: { outcome: "acted", actor_role: "staff", actor_name: "Ana Ruiz", result: { outcome: "done" } } });
    const client = createDeviceClient(admin, CALLER);
    const { data, error } = await client.rpc("cancel_reservation", { p_establishment_id: "est-OTRO", p_reservation_id: "r1", p_reason: "customer" });
    expect(error).toBeNull();
    expect(data).toEqual({ outcome: "done" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      name: "reservation_device_act",
      args: { p_token_hash: CALLER.tokenHash, p_pin_hmac: CALLER.pinHmac, p_staff_id: null, p_operation: "cancel", p_args: { reservation_id: "r1", reason: "customer" } },
    });
    // El restaurante de la llamada no viaja: la base de datos usa el del dispositivo.
    expect(JSON.stringify(calls[0].args)).not.toContain("est-OTRO");
  });

  it("RN-APP-08 · sin PIN va la persona de «Ajustes abiertos» (la prueba del servidor), y nunca las dos cosas", async () => {
    const { admin, calls } = fakeAdmin({ reservation_device_act: { outcome: "acted", actor_role: "manager", actor_name: "José", result: [] } });
    const client = createDeviceClient(admin, { ...CALLER, pinHmac: null, staffId: "staff-1" });
    await client.rpc("reservation_people", { p_establishment_id: "est-A" });
    expect(calls[0].args).toMatchObject({ p_pin_hmac: null, p_staff_id: "staff-1", p_operation: "people" });
    // Con PIN tecleado, la persona de «Ajustes abiertos» no se manda.
    const conPin = createDeviceClient(admin, { ...CALLER, staffId: "staff-1" });
    await conPin.rpc("cancel_reservation", { p_establishment_id: "est-A", p_reservation_id: "r1" });
    expect(calls[1].args).toMatchObject({ p_pin_hmac: CALLER.pinHmac, p_staff_id: null });
  });

  it("RN-APP-08 · un PIN malo, una tablet bloqueada o un rol que no alcanza no son un acierto: vuelven como un fallo de acceso", async () => {
    for (const [reply, code] of [
      [{ outcome: "wrong", remaining: 3 }, "wrong_pin"],
      [{ outcome: "locked", locked_until: "2026-10-03T10:00:00Z" }, "locked"],
      [{ outcome: "forbidden" }, "forbidden"],
      [{ outcome: "no_device" }, "no_device"],
      [{ outcome: "identity_invalid" }, "identity_invalid"],
    ] as const) {
      const { admin } = fakeAdmin({ reservation_device_act: reply });
      const { data, error } = await createDeviceClient(admin, CALLER).rpc("mark_no_show", { p_establishment_id: "est-A", p_reservation_id: "r1" });
      expect(data, code).toBeNull();
      expect(decodeDeviceAuthFailure(error?.message ?? "")?.code, code).toBe(code);
    }
  });

  it("RN-APP-08 · un error de la base de datos llega como error de la agenda, no como un acceso denegado", async () => {
    const { admin } = fakeAdmin({ reservation_device_act: new Error("Reserva no encontrada") });
    const { error } = await createDeviceClient(admin, CALLER).rpc("confirm_reservation", { p_establishment_id: "est-A", p_reservation_id: "r1" });
    expect(error?.message).toBe("Reserva no encontrada");
    expect(decodeDeviceAuthFailure(error?.message ?? "")).toBeNull();
  });

  it("RN-APP-08 · lo que la tablet no puede pedir se rechaza sin tocar la base de datos", async () => {
    for (const fn of ["agent_balance_cents", "open_reservation_support_session", "set_my_reservation_pin", "activate_reservation_device", "reservation_device_act", "invite_to_establishment_panel"]) {
      const { admin, calls } = fakeAdmin({});
      const { data, error } = await createDeviceClient(admin, CALLER).rpc(fn as never, { p_establishment_id: "est-A" } as never);
      expect(data, fn).toBeNull();
      expect(error?.message, fn).toMatch(/no permitida desde el dispositivo/i);
      expect(calls, fn).toHaveLength(0);
    }
  });

  it("RN-APP-08 · las lecturas pasan, pero el restaurante lo pone la tablet y no quien llama", async () => {
    const { admin, calls } = fakeAdmin({ reservations_search: [] });
    await createDeviceClient(admin, CALLER).rpc("reservations_search", { p_establishment_id: "est-OTRO", p_query: "gar" });
    expect(calls[0]).toEqual({ name: "reservations_search", args: { p_establishment_id: "est-A", p_query: "gar" } });
  });

  it("RN-APP-08 · las lecturas de tabla pasan al cliente de servicio tal cual", () => {
    const { admin, from } = fakeAdmin({});
    const client = createDeviceClient(admin, CALLER);
    client.from("reservations");
    expect(from).toHaveBeenCalledWith("reservations");
    expect((client as unknown as { storage: { id: string } }).storage.id).toBe("almacenamiento");
  });
});
