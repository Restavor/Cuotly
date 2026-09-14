import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type EnvLike,
  VAULT_KEY_ENV,
  VAULT_KEY_VERSION_ENV,
  VAULT_PREVIOUS_KEY_ENV,
  VaultError,
  createCredentialVault,
  vaultIsConfigured,
} from "./credential-vault";

/**
 * RN-INT-02 / §135 · "credenciales y tokens cifrados". Lo que se vigila:
 * que lo guardado no sea el token, que descifre lo que cifró, que un texto
 * alterado no descifre a otra cosa, que la clave se pueda rotar y que sin
 * clave no haya cifrado silencioso.
 */
const CLAVE = randomBytes(32).toString("base64");
const OTRA = randomBytes(32).toString("base64");

function entorno(extra: Record<string, string> = {}): EnvLike {
  return { [VAULT_KEY_ENV]: CLAVE, ...extra };
}

describe("credential-vault (RN-INT-02, §135)", () => {
  it("RN-INT-02 · cifra y descifra, y lo guardado no es el token ni empieza como uno", () => {
    const vault = createCredentialVault(entorno());
    const token = "1//0gAbCdEfRefreshToken";

    const { ciphertext, keyVersion } = vault.encrypt(token);

    expect(keyVersion).toBe(1);
    expect(ciphertext).not.toContain(token);
    expect(ciphertext.startsWith("cv1.1.")).toBe(true);
    expect(ciphertext.startsWith("1//")).toBe(false);
    expect(vault.decrypt(ciphertext, keyVersion)).toBe(token);
  });

  it("cada cifrado es distinto aunque el token sea el mismo (vector nuevo por credencial)", () => {
    const vault = createCredentialVault(entorno());
    expect(vault.encrypt("clave").ciphertext).not.toBe(vault.encrypt("clave").ciphertext);
  });

  it("un texto alterado no descifra a otra cosa: falla", () => {
    const vault = createCredentialVault(entorno());
    const { ciphertext } = vault.encrypt("secreto");
    const partes = ciphertext.split(".");
    partes[4] = partes[4].slice(0, -2) + (partes[4].endsWith("AA") ? "BB" : "AA");

    expect(() => vault.decrypt(partes.join("."), 1)).toThrow(VaultError);
    expect(() => vault.decrypt("no-es-de-la-boveda", 1)).toThrow(/formato/);
  });

  it("con otra clave no se descifra", () => {
    const cifrado = createCredentialVault(entorno()).encrypt("secreto").ciphertext;
    const otra = createCredentialVault({ [VAULT_KEY_ENV]: OTRA });

    expect(() => otra.decrypt(cifrado, 1)).toThrow(/no se descifra/);
  });

  it("rotación: la clave actual cifra con su versión y la anterior solo descifra lo viejo", () => {
    const vieja = createCredentialVault(entorno());
    const guardado = vieja.encrypt("token-viejo");

    const nueva = createCredentialVault({
      [VAULT_KEY_ENV]: OTRA,
      [VAULT_KEY_VERSION_ENV]: "2",
      [VAULT_PREVIOUS_KEY_ENV]: CLAVE,
    });

    expect(nueva.currentKeyVersion).toBe(2);
    expect(nueva.encrypt("token-nuevo").keyVersion).toBe(2);
    expect(nueva.decrypt(guardado.ciphertext, 1)).toBe("token-viejo");
    // La versión que dice la base tiene que ser la que dice el texto.
    expect(() => nueva.decrypt(guardado.ciphertext, 2)).toThrow(/versión/);

    const sinAnterior = createCredentialVault({ [VAULT_KEY_ENV]: OTRA, [VAULT_KEY_VERSION_ENV]: "2" });
    expect(() => sinAnterior.decrypt(guardado.ciphertext, 1)).toThrow(/No hay clave para la versión 1/);
  });

  it("sin clave no hay bóveda, y se dice: nunca se guarda en claro por defecto", () => {
    expect(() => createCredentialVault({})).toThrow(/INTEGRATIONS_VAULT_KEY no está configurada/);
    expect(vaultIsConfigured({})).toBe(false);
    expect(vaultIsConfigured(entorno())).toBe(true);
  });

  it("una clave que no es de 32 bytes se rechaza al arrancar", () => {
    expect(() => createCredentialVault({ [VAULT_KEY_ENV]: "corta" })).toThrow(/32 bytes/);
    expect(vaultIsConfigured({ [VAULT_KEY_ENV]: "corta" })).toBe(false);
    expect(() => createCredentialVault(entorno({ [VAULT_KEY_VERSION_ENV]: "cero" }))).toThrow(/entero/);
  });
});
