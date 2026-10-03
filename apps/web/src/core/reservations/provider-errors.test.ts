import { describe, expect, it } from "vitest";

import { classifyMetaError, classifyResendError, classifySmsError, classifyTransportError } from "./provider-errors";
import { isNoticeErrorCode } from "./notices";

describe("decisión 155 · qué hacer con el error de WhatsApp (Meta)", () => {
  it("decisión 155 · «mensaje no entregable» (131026) es no entregable: el aviso sale por SMS", () => {
    expect(classifyMetaError(131026, 400)).toEqual({ kind: "undeliverable", code: "meta_131026" });
  });

  it("decisión 155 · límites de velocidad y fallos del servicio de Meta se reintentan", () => {
    for (const code of [130429, 131000, 131016, 131048, 131056, 613]) {
      expect(classifyMetaError(code, 400).kind, String(code)).toBe("temporary");
    }
  });

  it("decisión 155 · una clave caducada, una cuenta bloqueada o una plantilla pausada son de configuración", () => {
    for (const code of [190, 131005, 131031, 131037, 132001, 132015, 132016, 133010, 210]) {
      expect(classifyMetaError(code, 400).kind, String(code)).toBe("config");
    }
  });

  it("decisión 155 · una plantilla mal rellenada no se arregla reintentando", () => {
    for (const code of [132000, 132005, 132007, 132012, 132999, 131008, 131009, 100]) {
      expect(classifyMetaError(code, 400).kind, String(code)).toBe("permanent");
    }
  });

  it("decisión 155 · un código que no conocemos es TEMPORAL, nunca «no entregable» (que paga un SMS)", () => {
    expect(classifyMetaError(999999, 400)).toEqual({ kind: "temporary", code: "meta_999999" });
  });

  it("decisión 155 · sin código, manda el estado HTTP", () => {
    expect(classifyMetaError(undefined, 500)).toEqual({ kind: "temporary", code: "meta_http_500" });
    expect(classifyMetaError(undefined, 401)).toEqual({ kind: "config", code: "meta_http_401" });
    expect(classifyMetaError(undefined, 400)).toEqual({ kind: "permanent", code: "meta_http_400" });
    expect(classifyMetaError(undefined, undefined)).toEqual({ kind: "temporary", code: "meta_unknown" });
  });
});

describe("decisión 155 · qué hacer con el error del SMS", () => {
  it("decisión 155 · un móvil que no existe o un fijo no puede recibirlo", () => {
    for (const code of [30003, 30005, 30006, 21614]) expect(classifySmsError(code, 400).kind, String(code)).toBe("undeliverable");
  });

  it("decisión 155 · bloqueado por el operador o dado de baja: no se reintenta", () => {
    for (const code of [30004, 30007, 21211, 21610]) expect(classifySmsError(code, 400).kind, String(code)).toBe("permanent");
  });

  it("decisión 155 · cuenta suspendida, credenciales malas o región sin permiso: configuración", () => {
    for (const code of [30002, 20003, 21408, 21606]) expect(classifySmsError(code, 400).kind, String(code)).toBe("config");
  });

  it("decisión 155 · un código desconocido es temporal", () => {
    expect(classifySmsError(12345, 400)).toEqual({ kind: "temporary", code: "sms_12345" });
    expect(classifySmsError(undefined, 503)).toEqual({ kind: "temporary", code: "sms_http_503" });
  });
});

describe("decisión 155 · qué hacer con el error de Resend (correo)", () => {
  it("decisión 155 · 401 y 403 son la clave o el dominio; 429 y 5xx se reintentan; el resto de 4xx, no", () => {
    expect(classifyResendError(401).kind).toBe("config");
    expect(classifyResendError(403).kind).toBe("config");
    expect(classifyResendError(429).kind).toBe("temporary");
    expect(classifyResendError(500).kind).toBe("temporary");
    expect(classifyResendError(422).kind).toBe("permanent");
    expect(classifyResendError(400).kind).toBe("permanent");
    expect(classifyResendError(undefined).kind).toBe("temporary");
  });

  it("decisión 155 · sin respuesta (red o tiempo agotado) siempre es temporal", () => {
    expect(classifyTransportError("timeout")).toEqual({ kind: "temporary", code: "timeout" });
    expect(classifyTransportError("network")).toEqual({ kind: "temporary", code: "network_error" });
  });
});

describe("RN-RES-12 · todo código que sale de aquí se puede guardar como error de un aviso", () => {
  it("RN-RES-12 · cumplen el patrón de la columna `error`", () => {
    const codes = [
      classifyMetaError(131026, 400).code,
      classifyMetaError(undefined, 502).code,
      classifySmsError(30008, 400).code,
      classifySmsError(undefined, 500).code,
      classifyResendError(429).code,
      classifyResendError(undefined).code,
      classifyTransportError("timeout").code,
      classifyTransportError("network").code,
    ];
    for (const code of codes) expect(isNoticeErrorCode(code), code).toBe(true);
  });
});
