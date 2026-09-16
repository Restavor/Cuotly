import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RN-ACC-01 y RN-ACC-10 · que el registro abierto siga cerrado.
 *
 * Desde la decisión 41 (16/09/2026) a Cuotly se entra por una solicitud de
 * acceso aprobada o por una invitación, y por nada más. La parte de ese
 * cierre que **no** vive en una migración es la que este archivo vigila,
 * porque es la que se puede revertir sin que nadie lo note:
 *
 *   1. `supabase/config.toml` con el alta pública apagada: `enable_signup`
 *      de `[auth]`, que es la clave y la única. Un `true` ahí devuelve la
 *      tercera puerta entera y ninguna política de RLS se entera: las
 *      cuentas nacerían igual, solo que sin permiso de nadie. La de
 *      `[auth.email]` **no** es su hermana y tiene su propio test abajo.
 *   2. Ningún proveedor de identidad externo encendido (RN-ACC-10). No es
 *      solo quitar un botón: un proveedor crea cuentas sin pasar por
 *      ninguna de las dos puertas.
 *   3. Ninguna pantalla con "entrar con Google". El botón sin el proveedor
 *      no crea cuentas, pero ofrece una forma de entrar que no existe, y
 *      eso es peor que no ofrecerla.
 *
 * Es el mismo patrón que `promesas-de-migracion.test.ts`: leer el archivo
 * de verdad y fallar si dice otra cosa, en vez de confiar en que alguien
 * se acuerde.
 */
const RAIZ = join(process.cwd(), "..", "..");
const CONFIG = join(RAIZ, "supabase", "config.toml");
const SRC = join(process.cwd(), "src");

/** El valor de una clave dentro de una sección `[x.y]` del TOML. */
function valorEnSeccion(toml: string, seccion: string, clave: string): string | null {
  const lineas = toml.split("\n");
  let dentro = false;
  for (const linea of lineas) {
    const recortada = linea.trim();
    if (recortada.startsWith("[")) {
      dentro = recortada === `[${seccion}]`;
      continue;
    }
    if (!dentro || recortada.startsWith("#")) continue;
    const corte = recortada.indexOf("=");
    if (corte < 0) continue;
    if (recortada.slice(0, corte).trim() === clave) {
      return recortada.slice(corte + 1).trim();
    }
  }
  return null;
}

function archivosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosDeCodigo(ruta);
    return /\.(ts|tsx)$/.test(entrada) ? [ruta] : [];
  });
}

describe("RN-ACC-01 · el registro abierto sigue cerrado", () => {
  it("RN-ACC-01: el alta pública está apagada", () => {
    const toml = readFileSync(CONFIG, "utf8");
    expect(valorEnSeccion(toml, "auth", "enable_signup"), "[auth] enable_signup").toBe("false");
    // Una sesión anónima es una cuenta sin puerta ninguna.
    expect(
      valorEnSeccion(toml, "auth", "enable_anonymous_sign_ins"),
      "[auth] enable_anonymous_sign_ins",
    ).toBe("false");
  });

  it("RN-ACC-01: y el proveedor de correo sigue ENCENDIDO, que no es lo mismo", () => {
    /*
      Este test existe por un fallo real del 16/09/2026. `[auth.email]
      enable_signup` trae el comentario "allow/disallow new user signups
      via email", parece el hermano de la clave de arriba, y no lo es: se
      traduce a `GOTRUE_EXTERNAL_EMAIL_ENABLED`. Ponerla en `false` no
      cierra ninguna puerta de alta —esa ya está cerrada— y en cambio
      **apaga el inicio de sesión con correo y contraseña**, que desde la
      decisión 41 es la única forma de entrar que queda.

      Se puso en `false` "por coherencia" y los quince recorridos de
      Playwright cayeron de golpe, todos con el mismo síntoma: nadie podía
      entrar. Así que aquí se exige lo contrario de lo que el instinto
      pide, y con el motivo escrito para que nadie lo "arregle".
    */
    const toml = readFileSync(CONFIG, "utf8");
    expect(
      valorEnSeccion(toml, "auth.email", "enable_signup"),
      "[auth.email] enable_signup apaga el LOGIN con correo, no el alta",
    ).toBe("true");
  });

  it("RN-ACC-10: ningún proveedor de identidad externo está encendido", () => {
    const toml = readFileSync(CONFIG, "utf8");
    const encendidos: string[] = [];
    let seccion = "";
    for (const linea of toml.split("\n")) {
      const recortada = linea.trim();
      if (recortada.startsWith("[")) {
        seccion = recortada.slice(1, -1);
        continue;
      }
      if (recortada.startsWith("#")) continue;
      if (seccion.startsWith("auth.external.") && /^enabled\s*=\s*true$/.test(recortada)) {
        encendidos.push(seccion);
      }
    }
    expect(encendidos, "proveedores externos encendidos").toEqual([]);
  });

  it("RN-ACC-10: no queda ninguna pantalla que ofrezca entrar con Google", () => {
    const culpables = archivosDeCodigo(SRC)
      .filter((ruta) => !ruta.endsWith("registro-cerrado.test.ts"))
      .filter((ruta) => /GoogleButton|signInWithOAuth/.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.slice(SRC.length + 1));

    expect(culpables, "pantallas que todavía ofrecen entrar con un proveedor externo").toEqual([]);
  });
});
