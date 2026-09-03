import { describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_LINK_TTL_SECONDS,
  FILES_BUCKET,
  createPrivateDownloadLink,
  createSignedUpload,
  discardObject,
  readObjectMetadata,
  type StorageClient,
  type UploadStorageClient,
} from "./file-storage";

function fakeStorage(response: Awaited<ReturnType<ReturnType<StorageClient["from"]>["createSignedUrl"]>>) {
  const createSignedUrl = vi.fn().mockResolvedValue(response);
  const storage: StorageClient = { from: vi.fn().mockReturnValue({ createSignedUrl }) };
  return { storage, createSignedUrl };
}

describe("file-storage — RN-ARC-08", () => {
  it("RN-ARC-08: el enlace de descarga es privado y temporal", async () => {
    const { storage, createSignedUrl } = fakeStorage({
      data: { signedUrl: "https://storage.example/firmado?token=abc" },
      error: null,
    });

    const result = await createPrivateDownloadLink(storage, "h7/factura.pdf");

    expect(result).toEqual({ ok: true, value: "https://storage.example/firmado?token=abc" });
    expect(storage.from).toHaveBeenCalledWith(FILES_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith("h7/factura.pdf", DOWNLOAD_LINK_TTL_SECONDS);
  });

  it("RN-ARC-08: la caducidad por defecto son cinco minutos, y se puede acortar", async () => {
    expect(DOWNLOAD_LINK_TTL_SECONDS).toBe(300);

    const { storage, createSignedUrl } = fakeStorage({ data: { signedUrl: "https://x" }, error: null });
    await createPrivateDownloadLink(storage, "h7/foto.png", 30);
    expect(createSignedUrl).toHaveBeenCalledWith("h7/foto.png", 30);
  });

  it("si el almacenamiento falla, es un error de negocio explícito y no una excepción", async () => {
    const { storage } = fakeStorage({ data: null, error: { message: "Object not found" } });
    expect(await createPrivateDownloadLink(storage, "h7/no-existe.pdf")).toEqual({
      ok: false,
      error: "link_unavailable",
    });
  });

  it("y si la llamada revienta, tampoco se propaga", async () => {
    const storage: StorageClient = {
      from: () => ({
        createSignedUrl: () => Promise.reject(new Error("red caída")),
      }),
    };
    expect(await createPrivateDownloadLink(storage, "h7/foto.png")).toEqual({
      ok: false,
      error: "link_unavailable",
    });
  });
});

describe("file-storage — la mitad de subir", () => {
  function fakeUploadStorage(overrides: {
    createSignedUploadUrl?: ReturnType<typeof vi.fn>;
    info?: ReturnType<typeof vi.fn>;
    remove?: ReturnType<typeof vi.fn>;
  }) {
    const bucket = {
      createSignedUploadUrl: overrides.createSignedUploadUrl ?? vi.fn(),
      info: overrides.info ?? vi.fn(),
      remove: overrides.remove ?? vi.fn().mockResolvedValue({ error: null }),
    };
    const storage = { from: vi.fn().mockReturnValue(bucket) } as unknown as UploadStorageClient;
    return { storage, bucket };
  }

  it("firma la subida de una ruta concreta, en el bucket privado", async () => {
    const createSignedUploadUrl = vi
      .fn()
      .mockResolvedValue({ data: { path: "esp/est/u1/carta.pdf", token: "tok" }, error: null });
    const { storage } = fakeUploadStorage({ createSignedUploadUrl });

    expect(await createSignedUpload(storage, "esp/est/u1/carta.pdf")).toEqual({
      ok: true,
      value: { path: "esp/est/u1/carta.pdf", token: "tok" },
    });
    expect(storage.from).toHaveBeenCalledWith(FILES_BUCKET);
    expect(createSignedUploadUrl).toHaveBeenCalledWith("esp/est/u1/carta.pdf");
  });

  it("si el almacenamiento no firma, es un error explícito y no una excepción", async () => {
    const { storage } = fakeUploadStorage({
      createSignedUploadUrl: vi.fn().mockResolvedValue({ data: null, error: { message: "nope" } }),
    });
    expect(await createSignedUpload(storage, "x")).toEqual({ ok: false, error: "upload_unavailable" });

    const revienta = {
      from: () => ({
        createSignedUploadUrl: () => Promise.reject(new Error("red caída")),
        info: vi.fn(),
        remove: vi.fn(),
      }),
    } as unknown as UploadStorageClient;
    expect(await createSignedUpload(revienta, "x")).toEqual({ ok: false, error: "upload_unavailable" });
  });

  it("RN-ARC-06: los metadatos son los del objeto guardado, no los que dijo el navegador", async () => {
    const { storage } = fakeUploadStorage({
      info: vi.fn().mockResolvedValue({
        data: { size: 1234, contentType: "video/mp4" },
        error: null,
      }),
    });

    // Aunque el formulario hubiera declarado "application/pdf" y 10 bytes,
    // lo que sale de aquí es lo que hay en el bucket. Quien valida después
    // rechaza el vídeo.
    expect(await readObjectMetadata(storage, "esp/est/u1/x")).toEqual({
      ok: true,
      value: { sizeBytes: 1234, mimeType: "video/mp4" },
    });
  });

  it("un objeto que no está es un error de negocio, no una excepción", async () => {
    const { storage } = fakeUploadStorage({
      info: vi.fn().mockResolvedValue({ data: null, error: { message: "Object not found" } }),
    });
    expect(await readObjectMetadata(storage, "no-existe")).toEqual({
      ok: false,
      error: "object_missing",
    });
  });

  it("descartar una subida rechazada no propaga el fallo de la limpieza", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("red caída"));
    const { storage } = fakeUploadStorage({ remove });

    await expect(discardObject(storage, "esp/est/u1/x")).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(["esp/est/u1/x"]);
  });
});
