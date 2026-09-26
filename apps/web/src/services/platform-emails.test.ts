import { describe, expect, it, vi } from "vitest";

import { createPlatformEmailComposer } from "./queue-gateway";
import {
  drainPlatformEmailQueue,
  type PlatformEmailGateway,
  type PlatformEmailRow,
} from "./queue-runner";

/**
 * RN-ACC-04 · la cola de correo hacia direcciones que todavía no son de
 * nadie. Se prueba entera sin base de datos y sin proveedor: el transporte
 * y la puerta son falsos, como en el resto de `queue-runner`.
 */
function fila(extra: Partial<PlatformEmailRow> = {}): PlatformEmailRow {
  return {
    email_id: "e1",
    kind: "access_request_approved",
    to_email: "nuria@bar-nuevo.test",
    payload: { contact_name: "Nuria", setup_token: "t0ken" },
    attempts: 0,
    ...extra,
  };
}

function puertaFalsa(filas: readonly PlatformEmailRow[]) {
  const enviados: { id: string; providerId: string | null }[] = [];
  const fallados: { id: string; error: string; dead: boolean }[] = [];
  const gateway: PlatformEmailGateway = {
    claimPlatformEmails: async () => filas,
    markPlatformEmailSent: async (id, providerId) => {
      enviados.push({ id, providerId });
    },
    markPlatformEmailFailed: async (id, error, _next, dead) => {
      fallados.push({ id, error, dead });
    },
  };
  return { gateway, enviados, fallados };
}

describe("RN-ACC-04 · el correo de la puerta de entrada", () => {
  it("compone el enlace de alta absoluto y no mete la contraseña en ninguna parte", () => {
    const composer = createPlatformEmailComposer("https://cuotly.com/");
    const mensaje = composer.compose(fila());

    expect(mensaje).not.toBeNull();
    expect(mensaje!.to).toBe("nuria@bar-nuevo.test");
    expect(mensaje!.body).toContain("https://cuotly.com/alta/t0ken");
    // La contraseña no viaja por correo: lo que viaja es el enlace.
    expect(mensaje!.body.toLowerCase()).not.toMatch(/tu contraseña es|contraseña provisional/);
  });

  it("una aprobación sin enlace no se manda: un «ya puedes entrar» sin por dónde es peor", async () => {
    const composer = createPlatformEmailComposer("https://cuotly.com");
    expect(composer.compose(fila({ payload: { contact_name: "Nuria" } }))).toBeNull();

    const { gateway, fallados } = puertaFalsa([fila({ payload: {} })]);
    const resultado = await drainPlatformEmailQueue(
      gateway,
      { send: async () => "id" },
      composer,
    );

    expect(resultado).toEqual({ sent: 0, retried: 0, dead: 1, blockedBy: null });
    expect(fallados[0].dead).toBe(true);
  });

  it("un tipo de correo que este proceso no conoce se cierra con su motivo, no se reintenta", async () => {
    const { gateway, fallados } = puertaFalsa([fila({ kind: "lo_que_sea" })]);
    const resultado = await drainPlatformEmailQueue(
      gateway,
      { send: async () => "id" },
      createPlatformEmailComposer("https://cuotly.com"),
    );

    expect(resultado.dead).toBe(1);
    expect(fallados[0].error).toContain("lo_que_sea");
  });

  it("un fallo del proveedor se reintenta con espera creciente, y al techo se cierra", async () => {
    const enviar = vi.fn().mockRejectedValue(new Error("Resend 503"));

    const primera = puertaFalsa([fila({ attempts: 1 })]);
    expect(
      await drainPlatformEmailQueue(primera.gateway, { send: enviar }, createPlatformEmailComposer("https://c.test")),
    ).toEqual({ sent: 0, retried: 1, dead: 0, blockedBy: null });
    expect(primera.fallados[0].dead).toBe(false);

    // El techo de intentos es el de `src/core/notifications.ts`, el mismo
    // que la cola de avisos: no se inventa uno aparte.
    const ultima = puertaFalsa([fila({ attempts: 99 })]);
    expect(
      await drainPlatformEmailQueue(ultima.gateway, { send: enviar }, createPlatformEmailComposer("https://c.test")),
    ).toEqual({ sent: 0, retried: 0, dead: 1, blockedBy: null });
    expect(ultima.fallados[0].dead).toBe(true);
  });

  it("RN-ACC-12 · el aviso a quien ya tiene cuenta no dice que alguien preguntó por ella", () => {
    const composer = createPlatformEmailComposer("https://cuotly.com");
    const mensaje = composer.compose(
      fila({ kind: "access_request_already_registered", payload: { contact_name: null } }),
    );

    expect(mensaje).not.toBeNull();
    expect(mensaje!.body).toContain("https://cuotly.com/login");
    // Ni nombre de quien lo intentó, ni negocio, ni teléfono: solo que
    // esta dirección ya tiene cuenta y que no se ha tocado nada.
    expect(mensaje!.body).toContain("no se ha");
  });

  it("RN-ADM-21 · el correo de la cuenta eliminada dice que su cuenta ha sido eliminada, sin enlace", () => {
    const mensaje = createPlatformEmailComposer("https://cuotly.com").compose(
      fila({ kind: "account_deleted", payload: {} }),
    );
    expect(mensaje).not.toBeNull();
    expect(mensaje!.body).toContain("Su cuenta ha sido eliminada");
    expect(mensaje!.body).not.toContain("https://");
  });

  it("los correos que la base puede encolar se saben componer", () => {
    const composer = createPlatformEmailComposer("https://cuotly.com");
    const payload = {
      contact_name: "Nuria",
      reason: "¿WordPress o no?",
      follow_up_token: "seg",
      setup_token: "alta",
    };

    for (const kind of [
      "access_request_received",
      "access_request_needs_information",
      "access_request_approved",
      "access_request_rejected",
      "access_request_already_registered",
      "account_deleted",
    ]) {
      expect(composer.compose(fila({ kind, payload })), kind).not.toBeNull();
    }
  });
});
