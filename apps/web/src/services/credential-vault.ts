/**
 * `src/services/credential-vault.ts` — el cifrado de las credenciales de
 * las integraciones (RN-INT-02, §135; Fase 3, Hito 14).
 *
 * La base guarda solo el resultado de cifrar aquí, con una clave que
 * existe únicamente en el entorno del servidor de la aplicación
 * (`INTEGRATIONS_VAULT_KEY`): ni Supabase ni nadie con acceso a la tabla
 * puede leer un token. AES-256-GCM, con vector de inicialización nuevo
 * por credencial y etiqueta de autenticidad: un texto cifrado alterado no
 * descifra a otra cosa, falla.
 *
 * El formato del texto guardado es `cv1.<versión>.<iv>.<etiqueta>.<datos>`
 * en base64url. Empieza siempre por `cv1.`, así que
 * `store_integration_credential()` puede seguir rechazando lo que parezca
 * un token de Google sin cifrar (`ya29.`, `1//`, `AIza`). La versión de la
 * clave viaja dentro y también en `integration_credentials.key_version`,
 * para poder rotarla: la clave actual cifra, y la anterior
 * (`INTEGRATIONS_VAULT_KEY_PREVIOUS`) solo descifra lo que se guardó con
 * ella hasta que se sustituya.
 *
 * Sin clave configurada no se cifra nada y se dice: el proceso de la cola
 * no reclama ejecuciones (no podría leer las credenciales) y la pantalla
 * enseña el motivo en vez de un botón que fallaría.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Un entorno: `process.env` o un objeto con las mismas claves en los tests. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export const VAULT_KEY_ENV = "INTEGRATIONS_VAULT_KEY";
export const VAULT_KEY_VERSION_ENV = "INTEGRATIONS_VAULT_KEY_VERSION";
export const VAULT_PREVIOUS_KEY_ENV = "INTEGRATIONS_VAULT_KEY_PREVIOUS";

const PREFIX = "cv1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedCredential {
  readonly ciphertext: string;
  readonly keyVersion: number;
}

export interface CredentialVault {
  encrypt(plaintext: string): EncryptedCredential;
  decrypt(ciphertext: string, keyVersion: number): string;
  /** La versión con la que cifra ahora mismo. */
  readonly currentKeyVersion: number;
}

export class VaultError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "bad_key" | "unknown_version" | "corrupt",
  ) {
    super(message);
    this.name = "VaultError";
  }
}

function decodeKey(value: string, name: string): Buffer {
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new VaultError(
      `${name} tiene que ser 32 bytes en base64 (tiene ${key.length}); genérala con: openssl rand -base64 32`,
      "bad_key",
    );
  }
  return key;
}

function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/**
 * La bóveda a partir del entorno. Lanza si la clave no está o no sirve:
 * es mejor que la ruta falle al arrancar que guardar una credencial "en
 * claro por defecto".
 */
export function createCredentialVault(env: EnvLike = process.env): CredentialVault {
  const current = env[VAULT_KEY_ENV];
  if (!current) {
    throw new VaultError(`${VAULT_KEY_ENV} no está configurada: no se puede cifrar ninguna credencial`, "not_configured");
  }
  const versionText = env[VAULT_KEY_VERSION_ENV] ?? "1";
  const currentKeyVersion = Number.parseInt(versionText, 10);
  if (!Number.isInteger(currentKeyVersion) || currentKeyVersion < 1) {
    throw new VaultError(`${VAULT_KEY_VERSION_ENV} tiene que ser un entero mayor que cero (es "${versionText}")`, "bad_key");
  }

  const keys = new Map<number, Buffer>();
  keys.set(currentKeyVersion, decodeKey(current, VAULT_KEY_ENV));
  const previous = env[VAULT_PREVIOUS_KEY_ENV];
  if (previous && currentKeyVersion > 1) {
    keys.set(currentKeyVersion - 1, decodeKey(previous, VAULT_PREVIOUS_KEY_ENV));
  }

  return {
    currentKeyVersion,

    encrypt(plaintext) {
      const key = keys.get(currentKeyVersion)!;
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return {
        ciphertext: [PREFIX, String(currentKeyVersion), b64url(iv), b64url(tag), b64url(data)].join("."),
        keyVersion: currentKeyVersion,
      };
    },

    decrypt(ciphertext, keyVersion) {
      const parts = ciphertext.split(".");
      if (parts.length !== 5 || parts[0] !== PREFIX) {
        throw new VaultError("La credencial guardada no tiene el formato de la bóveda", "corrupt");
      }
      const embeddedVersion = Number.parseInt(parts[1], 10);
      if (embeddedVersion !== keyVersion) {
        throw new VaultError(
          `La credencial dice versión ${parts[1]} y la base versión ${keyVersion}: no se descifra`,
          "corrupt",
        );
      }
      const key = keys.get(keyVersion);
      if (key === undefined) {
        throw new VaultError(
          `No hay clave para la versión ${keyVersion}: hace falta ${VAULT_PREVIOUS_KEY_ENV} o volver a autorizar`,
          "unknown_version",
        );
      }
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[2], "base64url"));
        decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
        return Buffer.concat([
          decipher.update(Buffer.from(parts[4], "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new VaultError("La credencial no se descifra: clave equivocada o texto alterado", "corrupt");
      }
    },
  };
}

/** Si el entorno tiene bóveda, sin lanzar: lo que la pantalla pregunta para decir el motivo. */
export function vaultIsConfigured(env: EnvLike = process.env): boolean {
  try {
    createCredentialVault(env);
    return true;
  } catch {
    return false;
  }
}
