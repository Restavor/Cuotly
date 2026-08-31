import { describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_LINK_TTL_SECONDS,
  FILES_BUCKET,
  createPrivateDownloadLink,
  type StorageClient,
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
