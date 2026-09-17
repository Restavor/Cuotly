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
 *   4. Ninguna pantalla que cree una cuenta por su cuenta, **ni en la web
 *      ni en la app del teléfono**. Este cuarto barrido llegó el
 *      17/09/2026 porque el archivo miraba solo `apps/web/src`: la app se
 *      quedó un día entero con `supabase.auth.signUp()` en `signup.tsx` y
 *      un "Regístrate" en el login que llevaba allí. No era un agujero
 *      —`enable_signup = false` cierra la puerta de verdad y GoTrue
 *      contestaba que no—, pero sí una pantalla que pedía una contraseña
 *      para una cuenta que no se iba a crear, y lo que falló no fue el
 *      cambio: fue que nadie barriera la otra superficie.
 *
 * Es el mismo patrón que `promesas-de-migracion.test.ts`: leer el archivo
 * de verdad y fallar si dice otra cosa, en vez de confiar en que alguien
 * se acuerde.
 */
const RAIZ = join(process.cwd(), "..", "..");
const CONFIG = join(RAIZ, "supabase", "config.toml");
const SRC = join(process.cwd(), "src");
/** La app del teléfono es la otra superficie, y entra en los mismos barridos. */
const MOVIL = join(RAIZ, "apps", "mobile");

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
    const culpables = pantallas()
      .filter((ruta) => /GoogleButton|signInWithOAuth/.test(codigo(ruta)))
      .map(nombreCorto);

    expect(culpables, "pantallas que todavía ofrecen entrar con un proveedor externo").toEqual([]);
  });

  it("RN-ACC-01: ninguna pantalla crea una cuenta por su cuenta, tampoco en el teléfono", () => {
    /*
      `signUp()` es la tercera puerta escrita en una pantalla. Aunque el
      proyecto la tenga cerrada, ofrecerla es prometer una cuenta que no va
      a existir — y el día que alguien encienda `enable_signup` "para
      probar", la promesa se cumple sin que nadie la apruebe.

      El barrido mira las DOS superficies: `apps/web/src` y `apps/mobile`.
      La app se quedó fuera un día entero y fue exactamente lo que se
      escapó.
    */
    const culpables = pantallas()
      .filter((ruta) => /\bauth\s*\.\s*signUp\b/.test(codigo(ruta)))
      .map(nombreCorto);

    expect(culpables, "pantallas que crean una cuenta sin pasar por las dos puertas").toEqual([]);
  });

  it("RN-ACC-02: la pantalla de la app pide acceso por la función pública del servidor", () => {
    // La contrapartida del barrido de arriba: que lo que hay en su sitio
    // sea el formulario de solicitud, y no un hueco. La cuenta nace al
    // aprobar (RN-ACC-03), no al enviar.
    const solicitud = readFileSync(join(MOVIL, "app", "signup.tsx"), "utf8");
    expect(solicitud).toContain("submit_access_request");
  });
});

/** Las pantallas de las dos superficies, sin este propio archivo. */
function pantallas(): readonly string[] {
  return [...archivosDeCodigo(SRC), ...archivosDeCodigo(join(MOVIL, "app")), ...archivosDeCodigo(join(MOVIL, "src"))]
    .filter((ruta) => !ruta.endsWith("registro-cerrado.test.ts"));
}

function nombreCorto(ruta: string): string {
  return ruta.startsWith(SRC) ? ruta.slice(SRC.length + 1) : `movil/${ruta.slice(MOVIL.length + 1)}`;
}

/** El código, sin comentarios: una puerta contada no es una puerta abierta. */
function codigo(ruta: string): string {
  return readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
