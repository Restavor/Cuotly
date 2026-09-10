import { describe, expect, it } from "vitest";

import { classifySignInError, type SignInFailure } from "./auth-errors";

describe("por qué no se ha podido entrar (CA-20 aplicado al login)", () => {
  const clasificar = (e: Parameters<typeof classifySignInError>[0]): SignInFailure | null =>
    classifySignInError(e);

  it("sin error, no hay fallo que clasificar", () => {
    expect(clasificar(null)).toBeNull();
    expect(clasificar(undefined)).toBeNull();
  });

  it("credenciales malas, que es el único caso que el mensaje viejo acertaba", () => {
    expect(clasificar({ status: 400, code: "invalid_credentials" })).toBe("invalid_credentials");
    expect(clasificar({ status: 400, message: "Invalid login credentials" })).toBe(
      "invalid_credentials",
    );
    // Un 400 sin código reconocido sigue siendo lo que contesta GoTrue.
    expect(clasificar({ status: 400, message: "algo raro" })).toBe("invalid_credentials");
  });

  it("sin respuesta del servidor NO son credenciales", () => {
    // Es el caso que costó una tarde: la contraseña era correcta y la
    // pantalla culpaba a la contraseña.
    expect(clasificar({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(
      "unreachable",
    );
    expect(clasificar({ message: "TypeError: fetch failed" })).toBe("unreachable");
    expect(clasificar({ message: "connect ECONNREFUSED 127.0.0.1:443" })).toBe("unreachable");
    expect(clasificar({ message: "getaddrinfo ENOTFOUND xyz.supabase.co" })).toBe("unreachable");
    expect(clasificar({ message: "network timeout" })).toBe("unreachable");
    // Sin status y sin mensaje reconocible: tampoco se culpa a la clave.
    expect(clasificar({ message: "" })).toBe("unreachable");
  });

  it("un 5xx es del servidor, nunca de quien escribe la contraseña", () => {
    expect(clasificar({ status: 500, message: "internal error" })).toBe("unreachable");
    expect(clasificar({ status: 503, message: "unavailable" })).toBe("unreachable");
  });

  it("demasiados intentos se dice como lo que es: temporal", () => {
    expect(clasificar({ status: 429, message: "too many requests" })).toBe("rate_limited");
    expect(clasificar({ status: 400, code: "over_request_rate_limit" })).toBe("rate_limited");
  });

  it("el correo sin confirmar tiene su propio motivo", () => {
    expect(clasificar({ status: 400, code: "email_not_confirmed" })).toBe("email_not_confirmed");
    expect(clasificar({ status: 400, message: "Email not confirmed" })).toBe("email_not_confirmed");
  });

  it("lo que no se reconoce no se disfraza de credenciales", () => {
    expect(clasificar({ status: 418, message: "soy una tetera" })).toBe("unknown");
  });
});
