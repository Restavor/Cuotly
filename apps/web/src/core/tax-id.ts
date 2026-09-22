/**
 * Decisión 68 (22/09/2026) · comprobar que el DNI, CIF o NIF de una
 * solicitud de acceso es real.
 *
 * Lo que se puede y lo que no, dicho sin adornos:
 *
 *   · **Ningún registro público contesta si un documento de identidad
 *     pertenece a una persona.** Ni en España ni fuera. Lo que sí se puede
 *     comprobar es que el número **esté bien formado**: casi todos llevan
 *     una letra o un dígito de control que sale de un cálculo con el
 *     resto, y un número inventado casi nunca cuadra.
 *   · **El número de IVA de una empresa de la UE sí se puede comprobar de
 *     verdad**, contra VIES (`src/services/vies.ts`), que dice si está
 *     dado de alta y a nombre de quién.
 *
 * Este archivo es el cálculo: puro, sin red, igual en la web y en el
 * teléfono. Qué se hace con él —rechazar, consultar VIES, marcar para el
 * equipo— lo decide `src/services/access-request.ts`, en el servidor.
 *
 * Los cálculos que hay son los que se conocen con certeza y están
 * probados con números calculados aparte: España (DNI, NIE, CIF y los NIF
 * de las letras K, L y M), Portugal (NIF), Países Bajos (BSN y RSIN) y
 * Bélgica (número nacional y número de empresa). Para el resto de países
 * no se inventa ninguno: un cálculo mal escrito rechazaría a gente real,
 * que es peor que no tenerlo.
 */

/** Sin espacios, puntos, guiones ni barras, y en mayúsculas. */
export function normalizeTaxId(value: string): string {
  return value.replace(/[\s.\-/]/g, "").toUpperCase();
}

/**
 * Los países de la UE con número de IVA en VIES, con el código que usa
 * VIES. Grecia es la excepción: su código ISO es GR y en VIES es EL.
 */
export const VIES_COUNTRY_CODES: Readonly<Record<string, string>> = {
  AT: "AT", BE: "BE", BG: "BG", CY: "CY", CZ: "CZ", DE: "DE", DK: "DK", EE: "EE",
  ES: "ES", FI: "FI", FR: "FR", GR: "EL", HR: "HR", HU: "HU", IE: "IE", IT: "IT",
  LT: "LT", LU: "LU", LV: "LV", MT: "MT", NL: "NL", PL: "PL", PT: "PT", RO: "RO",
  SE: "SE", SI: "SI", SK: "SK",
};

export function isViesCountry(country: string): boolean {
  return Object.prototype.hasOwnProperty.call(VIES_COUNTRY_CODES, country);
}

/**
 * El número tal como lo quiere VIES: sin el prefijo del país delante, que
 * mucha gente escribe ("PT501964843", "EL123…").
 */
export function viesNumber(country: string, normalized: string): string {
  const prefijo = VIES_COUNTRY_CODES[country];
  if (prefijo !== undefined && normalized.startsWith(prefijo)) return normalized.slice(prefijo.length);
  if (normalized.startsWith(country)) return normalized.slice(country.length);
  return normalized;
}

export type TaxIdMethod =
  | "es_dni"
  | "es_nie"
  | "es_nif_klm"
  | "es_cif"
  | "pt_nif"
  | "nl_bsn"
  | "be_national"
  | "be_company";

export type LocalTaxIdCheck =
  /** El cálculo de control cuadra. */
  | { readonly kind: "valid"; readonly method: TaxIdMethod }
  /** Hay cálculo para ese país y el número no lo pasa: es falso o está mal escrito. */
  | { readonly kind: "invalid" }
  /** Para ese país no hay cálculo en Cuotly. */
  | { readonly kind: "no_algorithm" };

const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

function letraDni(numero: number): string {
  return LETRAS_DNI[numero % 23];
}

function checkSpain(v: string): LocalTaxIdCheck {
  // DNI: ocho cifras y la letra que sale del resto entre 23.
  if (/^\d{8}[A-Z]$/.test(v)) {
    return letraDni(Number(v.slice(0, 8))) === v[8] ? { kind: "valid", method: "es_dni" } : { kind: "invalid" };
  }
  // NIE: X, Y o Z (que valen 0, 1 y 2), siete cifras y la misma letra.
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const numero = Number(String("XYZ".indexOf(v[0])) + v.slice(1, 8));
    return letraDni(numero) === v[8] ? { kind: "valid", method: "es_nie" } : { kind: "invalid" };
  }
  // NIF de personas sin DNI (K, L, M): siete cifras y la letra del DNI.
  if (/^[KLM]\d{7}[A-Z]$/.test(v)) {
    return letraDni(Number(v.slice(1, 8))) === v[8] ? { kind: "valid", method: "es_nif_klm" } : { kind: "invalid" };
  }
  // CIF: letra de la forma jurídica, siete cifras y un control que es
  // cifra o letra (J = 0, A = 1 … I = 9).
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const cifras = v.slice(1, 8);
    let suma = 0;
    for (let i = 0; i < 7; i += 1) {
      let n = Number(cifras[i]);
      if (i % 2 === 0) {
        n *= 2;
        n = Math.floor(n / 10) + (n % 10);
      }
      suma += n;
    }
    const digito = (10 - (suma % 10)) % 10;
    const letra = "JABCDEFGHI"[digito];
    const control = v[8];
    // Unas formas llevan siempre letra, otras siempre cifra, el resto cualquiera.
    const soloLetra = "NPQRSW".includes(v[0]);
    const soloCifra = "ABEH".includes(v[0]);
    const vale =
      (control === letra && !soloCifra) || (control === String(digito) && !soloLetra);
    return vale ? { kind: "valid", method: "es_cif" } : { kind: "invalid" };
  }
  // Cualquier otra forma no es un documento español.
  return { kind: "invalid" };
}

function pesos98(v: string): number {
  let suma = 0;
  for (let i = 0; i < 8; i += 1) suma += Number(v[i]) * (9 - i);
  return suma;
}

function checkPortugal(v: string): LocalTaxIdCheck {
  if (!/^\d{9}$/.test(v)) return { kind: "invalid" };
  const resto = pesos98(v) % 11;
  const control = resto < 2 ? 0 : 11 - resto;
  return control === Number(v[8]) ? { kind: "valid", method: "pt_nif" } : { kind: "invalid" };
}

function checkNetherlands(v: string): LocalTaxIdCheck {
  // El número de IVA holandés (NL…B01) no tiene esta forma: ese va a VIES.
  if (!/^\d{9}$/.test(v) || /^0{9}$/.test(v)) return { kind: "no_algorithm" };
  return (pesos98(v) - Number(v[8])) % 11 === 0
    ? { kind: "valid", method: "nl_bsn" }
    : { kind: "invalid" };
}

function checkBelgium(v: string): LocalTaxIdCheck {
  // Número nacional: once cifras; el control es 97 menos el resto de las
  // nueve primeras entre 97, con un 2 delante para los nacidos desde 2000.
  if (/^\d{11}$/.test(v)) {
    const control = Number(v.slice(9));
    const nueve = v.slice(0, 9);
    const siglo20 = 97 - (Number(nueve) % 97);
    const siglo21 = 97 - (Number(`2${nueve}`) % 97);
    return control === siglo20 || control === siglo21
      ? { kind: "valid", method: "be_national" }
      : { kind: "invalid" };
  }
  // Número de empresa (y de IVA): diez cifras, el control con las ocho primeras.
  if (/^[01]\d{9}$/.test(v)) {
    return 97 - (Number(v.slice(0, 8)) % 97) === Number(v.slice(8))
      ? { kind: "valid", method: "be_company" }
      : { kind: "invalid" };
  }
  return { kind: "no_algorithm" };
}

/**
 * El cálculo de control del documento, según el país que eligió la
 * persona. `value` tiene que venir ya normalizado.
 */
export function checkTaxIdLocally(country: string, value: string): LocalTaxIdCheck {
  if (value === "") return { kind: "invalid" };
  switch (country) {
    case "ES":
      return checkSpain(value);
    case "PT":
      return checkPortugal(viesNumber("PT", value));
    case "NL":
      return checkNetherlands(value);
    case "BE":
      return checkBelgium(viesNumber("BE", value));
    default:
      return { kind: "no_algorithm" };
  }
}

/**
 * Cómo quedó comprobado el documento. Se guarda con la solicitud y quien
 * revisa lo ve con su explicación.
 */
export const TAX_ID_VERIFICATIONS = [
  /** El cálculo de control cuadra. */
  "checksum",
  /** VIES confirma el número de IVA. */
  "registry",
  /** VIES no lo encuentra y no hay cálculo que lo respalde. */
  "registry_not_found",
  /** VIES no contestó y no hay cálculo que lo respalde. */
  "registry_unavailable",
  /** País sin cálculo y fuera de VIES: no hay nada automático que mirar. */
  "unverified",
] as const;

export type TaxIdVerification = (typeof TAX_ID_VERIFICATIONS)[number];

/** Las dos que no necesitan que el equipo mire nada más. */
export function taxIdVerified(verification: TaxIdVerification): boolean {
  return verification === "checksum" || verification === "registry";
}

/** Lo que contestó VIES, reducido a lo que importa aquí. */
export type ViesAnswer =
  | { readonly kind: "found"; readonly name: string | null }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

/**
 * Decisión 68 · juntar el cálculo y la respuesta de VIES en una decisión.
 *
 *   · Si el cálculo dice que el número es falso, se **rechaza**. En España
 *     cualquier forma que no sea DNI, NIE, NIF o CIF también.
 *   · Si VIES lo confirma, **comprobado en el registro**.
 *   · Si el cálculo cuadra, **comprobado por cálculo**, conteste lo que
 *     conteste VIES (un particular portugués no tiene por qué estar en
 *     VIES, y su NIF es real).
 *   · Si no hay nada que lo respalde, **entra marcado** para el equipo:
 *     rechazarlo dejaría fuera a gente real de países sin cálculo.
 *
 * `vies` es `null` cuando no se consultó (España, o un país fuera de la UE).
 */
export function decideTaxId(
  local: LocalTaxIdCheck,
  vies: ViesAnswer | null,
): { readonly ok: false } | { readonly ok: true; readonly verification: TaxIdVerification; readonly registryName: string | null } {
  if (local.kind === "invalid") return { ok: false };
  if (vies !== null && vies.kind === "found") {
    return { ok: true, verification: "registry", registryName: vies.name };
  }
  if (local.kind === "valid") return { ok: true, verification: "checksum", registryName: null };
  if (vies === null) return { ok: true, verification: "unverified", registryName: null };
  return {
    ok: true,
    verification: vies.kind === "not_found" ? "registry_not_found" : "registry_unavailable",
    registryName: null,
  };
}
