import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import {
  ALLOWED_MIME_TYPES,
  FILE_CATEGORIES,
  MAX_FILE_SIZE_BYTES,
  fileTypeLabel,
  canRequestPermanentDeletion,
  canViewFile,
  nextVersionNumber,
  sanitizeFileName,
  storageObjectPath,
  storagePrefixFor,
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
      // trabajador (RN-ASG-01 y §4.3).
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

describe("RN-ARC-08 · la ruta del objeto en el bucket privado", () => {
  const ESPACIO = "d1000000-0000-0000-0000-000000000001";
  const RESTAURANTE = "d4000000-0000-0000-0000-000000000001";

  it("cuelga del espacio y del establecimiento, con un segmento único por versión", () => {
    expect(
      storageObjectPath({
        spaceId: ESPACIO,
        establishmentId: RESTAURANTE,
        uniqueId: "abc123",
        fileName: "carta.pdf",
      }),
    ).toBe(`${ESPACIO}/${RESTAURANTE}/abc123/carta.pdf`);
  });

  it("el prefijo del establecimiento es el que se comprueba al registrar", () => {
    const ruta = storageObjectPath({
      spaceId: ESPACIO,
      establishmentId: RESTAURANTE,
      uniqueId: "abc123",
      fileName: "carta.pdf",
    });
    expect(ruta.startsWith(storagePrefixFor(ESPACIO, RESTAURANTE))).toBe(true);
    expect(ruta.startsWith(storagePrefixFor(ESPACIO, "d4000000-0000-0000-0000-000000000002"))).toBe(
      false,
    );
  });

  it("RN-ARC-03: dos subidas del mismo nombre no comparten ruta, porque ninguna versión desaparece", () => {
    const uno = storageObjectPath({ spaceId: ESPACIO, establishmentId: RESTAURANTE, uniqueId: "v1", fileName: "menu.pdf" });
    const dos = storageObjectPath({ spaceId: ESPACIO, establishmentId: RESTAURANTE, uniqueId: "v2", fileName: "menu.pdf" });
    expect(uno).not.toBe(dos);
  });
});

describe("sanitizeFileName · el nombre que llega del navegador es texto del usuario", () => {
  it("no deja salir de la carpeta", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFileName("/absoluto/carta.pdf")).toBe("absoluto-carta.pdf");
    expect(sanitizeFileName("..")).toBe("archivo");
  });

  it("quita acentos y espacios en vez de dejar una ruta frágil", () => {
    expect(sanitizeFileName("Menú de Otoño.pdf")).toBe("Menu-de-Otono.pdf");
    expect(sanitizeFileName("factura   marzo.pdf")).toBe("factura-marzo.pdf");
  });

  it("nunca devuelve vacío ni algo que empiece por punto", () => {
    expect(sanitizeFileName("")).toBe("archivo");
    expect(sanitizeFileName("   ")).toBe("archivo");
    expect(sanitizeFileName("😀😀")).toBe("archivo");
    expect(sanitizeFileName(".oculto")).toBe("oculto");
  });

  it("acorta un nombre desmedido sin romperse", () => {
    expect(sanitizeFileName("a".repeat(500))).toHaveLength(80);
  });

  it("conserva la extensión de un nombre normal", () => {
    expect(sanitizeFileName("justificante_2026-09-03.pdf")).toBe("justificante_2026-09-03.pdf");
  });
});

/**
 * CA-21 aplicado a los archivos: "solo existe UN sitio donde algo tiene
 * nombre". Las ocho categorías las leen ahora dos pantallas —la ficha del
 * equipo (§15.2) y el catálogo del restaurante— y por eso su diccionario
 * vive en `es.space.files.categories` y no dentro de una de las dos. Este
 * barrido es lo que impide que la próxima pantalla escriba la tercera
 * copia: si alguien añade una categoría en `src/core/files.ts` y no le
 * pone nombre, o deja un nombre huérfano de una que ya no existe, falla.
 * Es el mismo control que `naming.test.ts` hace con los estados, y la
 * razón de tenerlo está en la salvedad 18 del ROADMAP: tres listas
 * escritas a mano llevaban meses discrepando de la base.
 */
describe("RN-ARC-01 · las ocho categorías, nombradas una sola vez", () => {
  it("el diccionario cubre todas las categorías y no tiene ninguna de más", () => {
    expect(Object.keys(es.space.files.categories).sort()).toEqual([...FILE_CATEGORIES].sort());
  });

  it("ningún nombre está vacío", () => {
    for (const nombre of Object.values(es.space.files.categories)) {
      expect(nombre.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("etiqueta del tipo de archivo (maqueta 16)", () => {
  it("traduce cada tipo permitido a su etiqueta corta", () => {
    expect(fileTypeLabel("image/png")).toBe("PNG");
    expect(fileTypeLabel("image/jpeg")).toBe("JPG");
    expect(fileTypeLabel("application/pdf")).toBe("PDF");
    expect(
      fileTypeLabel(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("Excel");
  });

  it("todos los tipos que se pueden subir tienen etiqueta", () => {
    // Si mañana RN-ARC-06 admite uno más y nadie le pone etiqueta, la
    // columna "Tipo" diría "no consta" para un archivo perfectamente
    // normal. Esto lo caza aquí y no en producción.
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(fileTypeLabel(mime)).not.toBeNull();
    }
  });

  it("lo que no reconoce devuelve null, no una etiqueta inventada", () => {
    expect(fileTypeLabel("video/mp4")).toBeNull();
    expect(fileTypeLabel("")).toBeNull();
  });
});
