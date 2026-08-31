import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  canRequestPermanentDeletion,
  canViewFile,
  nextVersionNumber,
  validateUpload,
} from "./files";

describe("files — RN-ARC, RN-MSG-09", () => {
  describe("RN-ARC-06 · RN-MSG-09: 25 MB, imágenes/PDF/Word/Excel/texto, ni vídeos ni ejecutables", () => {
    it("el máximo son 25 MB exactos", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(26_214_400);
    });

    it("acepta un PDF de tamaño normal", () => {
      expect(validateUpload({ mimeType: "application/pdf", sizeBytes: 2_000_000 })).toEqual({
        ok: true,
        value: undefined,
      });
    });

    it("acepta justo 25 MB y rechaza un solo byte más", () => {
      expect(validateUpload({ mimeType: "image/png", sizeBytes: MAX_FILE_SIZE_BYTES }).ok).toBe(true);
      expect(validateUpload({ mimeType: "image/png", sizeBytes: MAX_FILE_SIZE_BYTES + 1 })).toEqual({
        ok: false,
        error: "too_large",
      });
    });

    it("rechaza un vídeo aunque sea pequeño", () => {
      expect(validateUpload({ mimeType: "video/mp4", sizeBytes: 1_000 })).toEqual({
        ok: false,
        error: "type_not_allowed",
      });
    });

    it("rechaza un ejecutable", () => {
      expect(validateUpload({ mimeType: "application/x-msdownload", sizeBytes: 1_000 })).toEqual({
        ok: false,
        error: "type_not_allowed",
      });
    });

    it("no hay ningún tipo de vídeo ni ejecutable en la lista blanca", () => {
      expect(ALLOWED_MIME_TYPES.some((type) => type.startsWith("video/"))).toBe(false);
      expect(ALLOWED_MIME_TYPES).not.toContain("application/x-msdownload");
    });

    it("un archivo vacío se rechaza con su propio motivo", () => {
      expect(validateUpload({ mimeType: "text/plain", sizeBytes: 0 })).toEqual({ ok: false, error: "empty" });
    });
  });

  describe("RN-ARC-03: sustituir crea una versión nueva y la anterior permanece", () => {
    it("el primer archivo es la versión 1", () => {
      expect(nextVersionNumber([])).toBe(1);
    });

    it("sustituir dos veces da la versión 3, sin reutilizar números", () => {
      expect(nextVersionNumber([1, 2])).toBe(3);
    });
  });

  describe("RN-ARC-04 · RN-ARC-05 · RN-FIN-07: quién ve qué", () => {
    const compartida = { category: "photos", visibility: "shared_with_client" } as const;
    const interna = { category: "photos", visibility: "internal" } as const;
    const factura = { category: "billing", visibility: "shared_with_client" } as const;

    it("RN-ARC-05: un trabajador nunca ve facturación, ni de un establecimiento autorizado", () => {
      expect(canViewFile({ side: "space", role: "worker", isAuthorizedForEstablishment: true }, factura)).toBe(false);
      expect(
        canViewFile({ side: "space", role: "worker", isAuthorizedForEstablishment: true }, { ...factura, visibility: "internal" }),
      ).toBe(false);
    });

    it("el trabajador sí ve los archivos operativos de sus establecimientos autorizados, internos incluidos", () => {
      expect(canViewFile({ side: "space", role: "worker", isAuthorizedForEstablishment: true }, interna)).toBe(true);
    });

    it("y no ve nada de un establecimiento que no tiene autorizado", () => {
      expect(canViewFile({ side: "space", role: "worker", isAuthorizedForEstablishment: false }, compartida)).toBe(false);
    });

    it("propietario y administrador ven todo el espacio, facturación incluida", () => {
      // isAuthorizedForEstablishment: false a propósito — propietario y
      // administrador ven todo su espacio aunque no tengan el
      // establecimiento autorizado (§4.2); el campo solo lo consulta el
      // trabajador (RN-ARC-10).
      expect(canViewFile({ side: "space", role: "owner", isAuthorizedForEstablishment: false }, factura)).toBe(true);
      expect(canViewFile({ side: "space", role: "admin", isAuthorizedForEstablishment: false }, interna)).toBe(true);
    });

    it("RN-ARC-04: el cliente solo ve lo marcado 'Compartido con el restaurante'", () => {
      expect(canViewFile({ side: "client", canViewBilling: false }, compartida)).toBe(true);
      expect(canViewFile({ side: "client", canViewBilling: false }, interna)).toBe(false);
    });

    it("RN-FIN-07: la facturación compartida solo la ve el cliente con visibilidad financiera", () => {
      expect(canViewFile({ side: "client", canViewBilling: false }, factura)).toBe(false);
      expect(canViewFile({ side: "client", canViewBilling: true }, factura)).toBe(true);
    });
  });

  describe("RN-ARC-07: nada se borra; el borrado definitivo solo lo solicita el propietario", () => {
    it("un adjunto de mensaje no se elimina nunca", () => {
      expect(
        canRequestPermanentDeletion({ viewerRole: "owner", isMessageAttachment: true, linkedEntityTypes: [] }),
      ).toEqual({ ok: false, error: "message_attachment" });
    });

    it("un archivo vinculado a una operación tampoco", () => {
      expect(
        canRequestPermanentDeletion({ viewerRole: "owner", isMessageAttachment: false, linkedEntityTypes: ["job"] }),
      ).toEqual({ ok: false, error: "linked_to_operational_record" });
    });

    it("un administrador no puede solicitarlo: solo el propietario del espacio", () => {
      expect(
        canRequestPermanentDeletion({ viewerRole: "admin", isMessageAttachment: false, linkedEntityTypes: [] }),
      ).toEqual({ ok: false, error: "not_space_owner" });
    });

    it("el propietario sí, sobre un archivo suelto", () => {
      expect(
        canRequestPermanentDeletion({ viewerRole: "owner", isMessageAttachment: false, linkedEntityTypes: [] }),
      ).toEqual({ ok: true, value: undefined });
    });
  });
});
