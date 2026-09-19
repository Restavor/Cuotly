import { describe, expect, it } from "vitest";

import {
  AVATARS_BUCKET,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  avatarInitial,
  avatarLink,
  avatarPathFor,
  checkAvatarFile,
  uploadAvatar,
} from "./avatar-storage";

/**
 * RN-GLO-09 · la foto de perfil, del lado del adaptador.
 *
 * Lo que de verdad importa aquí es **la ruta**: `set_my_avatar()` rechaza
 * una que no empiece por el uuid de quien llama, así que si esta función
 * dejara de ponerlo delante, guardar la foto empezaría a fallar en
 * producción y no en ningún test. Por eso se comprueba el prefijo con la
 * barra, que es literalmente lo que mira el servidor.
 */
describe("RN-GLO-09 · dónde se guarda la foto", () => {
  it("la ruta empieza por el uuid de su dueño y una barra", () => {
    const ruta = avatarPathFor("11111111-2222-3333-4444-555555555555", "image/png");
    expect(ruta.startsWith("11111111-2222-3333-4444-555555555555/")).toBe(true);
  });

  it("dos fotos seguidas no comparten ruta", () => {
    // Si la compartieran, el navegador seguiría enseñando la vieja desde
    // su caché y la persona creería que no se ha guardado.
    const a = avatarPathFor("u", "image/png", new Date(1_000));
    const b = avatarPathFor("u", "image/png", new Date(2_000));
    expect(a).not.toBe(b);
  });

  it("la extensión sigue al tipo, no al nombre que trajera el archivo", () => {
    expect(avatarPathFor("u", "image/png")).toMatch(/\.png$/);
    expect(avatarPathFor("u", "image/webp")).toMatch(/\.webp$/);
    expect(avatarPathFor("u", "image/jpeg")).toMatch(/\.jpg$/);
  });
});

describe("RN-GLO-09 · lo que se admite", () => {
  it("una imagen normal pasa", () => {
    expect(checkAvatarFile({ size: 1024, type: "image/jpeg" }).ok).toBe(true);
  });

  it("un PDF no, aunque pese poco", () => {
    const r = checkAvatarFile({ size: 10, type: "application/pdf" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("wrong_type");
  });

  it("una imagen de más de 2 MB tampoco", () => {
    const r = checkAvatarFile({ size: AVATAR_MAX_BYTES + 1, type: "image/png" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_large");
  });

  it("los formatos de aquí son los que declara el bucket", () => {
    // Son los mismos que la migración 109. Si alguien añadiera un formato
    // en un sitio y no en el otro, el navegador dejaría elegir un archivo
    // que el servidor rechaza sin explicar por qué.
    expect([...AVATAR_MIME_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});

describe("RN-ARC-08 · el enlace es firmado, temporal y de su bucket", () => {
  it("firma contra el bucket de fotos, no contra el de archivos", async () => {
    const pedidos: string[] = [];
    const storage = {
      from(bucket: string) {
        pedidos.push(bucket);
        return {
          createSignedUrl: async () => ({ data: { signedUrl: "https://x/y" }, error: null }),
        };
      },
    };
    await avatarLink(storage, "u/1.png");
    expect(pedidos).toEqual([AVATARS_BUCKET]);
  });

  it("sin foto no pide nada al almacenamiento", async () => {
    let llamado = false;
    const storage = {
      from() {
        llamado = true;
        return { createSignedUrl: async () => ({ data: null, error: null }) };
      },
    };
    expect(await avatarLink(storage, null)).toBeNull();
    expect(llamado).toBe(false);
  });

  it("si el almacenamiento falla se enseña la inicial, no un error", async () => {
    // Una pantalla sin foto enseña lo mismo que la de quien no tiene foto.
    // No hay nada que explicarle a nadie, así que no se rompe.
    const storage = {
      from: () => ({
        createSignedUrl: async () => {
          throw new Error("caído");
        },
      }),
    };
    expect(await avatarLink(storage, "u/1.png")).toBeNull();
  });
});

describe("RN-GLO-09 · la subida", () => {
  it("sube al bucket de fotos con su tipo", async () => {
    const visto: { bucket?: string; path?: string; contentType?: string } = {};
    const storage = {
      from(bucket: string) {
        visto.bucket = bucket;
        return {
          upload: async (path: string, _b: ArrayBuffer, o?: { contentType?: string }) => {
            visto.path = path;
            visto.contentType = o?.contentType;
            return { error: null };
          },
        };
      },
    };
    const r = await uploadAvatar(storage, "u/1.png", new ArrayBuffer(4), "image/png");
    expect(r.ok).toBe(true);
    expect(visto).toEqual({ bucket: AVATARS_BUCKET, path: "u/1.png", contentType: "image/png" });
  });

  it("un fallo del almacenamiento es un resultado, no una excepción", async () => {
    // CLAUDE.md · errores de negocio como resultado explícito: la pantalla
    // tiene que poder decir "no se ha podido guardar" en vez de romperse.
    const storage = {
      from: () => ({ upload: async () => ({ error: { message: "lleno" } }) }),
    };
    const r = await uploadAvatar(storage, "u/1.png", new ArrayBuffer(4), "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("upload_failed");
  });
});

describe("cuando no hay foto", () => {
  it("la inicial sale del nombre", () => {
    expect(avatarInitial("Bosco Núñez", "info@restavor.com")).toBe("B");
  });

  it("y del correo mientras no haya nombre", () => {
    expect(avatarInitial(null, "info@restavor.com")).toBe("I");
    expect(avatarInitial("   ", "info@restavor.com")).toBe("I");
  });
});
